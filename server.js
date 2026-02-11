const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const { admin, db } = require('./firebaseAdmin');

app.use(express.static('public'));

// Game State
const questions = [
    { id: 1, question: "What is the capital of France?", answer: "paris", position: { x: 0, y: 1, z: -10 }, isSolved: false },
    { id: 2, question: "What is 2 + 2?", answer: "4", position: { x: 10, y: 1, z: 0 }, isSolved: false },
    { id: 3, question: "What language is this server written in?", answer: "javascript", position: { x: -10, y: 1, z: 0 }, isSolved: false },
    { id: 4, question: "What is the boiling point of water (C)?", answer: "100", position: { x: 0, y: 1, z: 10 }, isSolved: false },
    { id: 5, question: "Which planet is known as the Red Planet?", answer: "mars", position: { x: 5, y: 1, z: 5 }, isSolved: false }
];

// Safe Spawning Logic
const CITY_SIZE = 220;
const BLOCK_SIZE = 20;
const ROAD_WIDTH = 10;
const UNIT_SIZE = BLOCK_SIZE + ROAD_WIDTH;

function getSafePosition(id) {
    // We want to spawn on roads or intersections to ensure accessibility
    // Grid generation logic mirror:
    // Roads are at intervals.
    // Let's pick a random intersection or road segment.

    const halfCity = CITY_SIZE / 2;
    const roadCoords = [];

    // Generate logical road centerlines
    // Based on game.js: loop from -halfCity, step UNIT_SIZE
    // The road is 'between' blocks.
    // Actually, in game.js: 
    // for (let x = -halfCity; x < halfCity; x += UNIT_SIZE) { ROADS.x.push(x - ROAD_WIDTH/2); }
    // Let's generate these candidates.

    for (let i = -halfCity; i < halfCity; i += UNIT_SIZE) {
        roadCoords.push(i - ROAD_WIDTH / 2);
    }

    // Pick a random spot
    // Option A: Intersection
    // Option B: Along a road

    const isIntersection = Math.random() > 0.3; // 70% chance intersection
    const rx = roadCoords[Math.floor(Math.random() * roadCoords.length)];
    const rz = roadCoords[Math.floor(Math.random() * roadCoords.length)];

    let x = rx;
    let z = rz;

    if (!isIntersection) {
        // Offset along one axis to be on the street but not center intersection
        if (Math.random() > 0.5) {
            x += (Math.random() - 0.5) * BLOCK_SIZE; // Move along the X road segment
        } else {
            z += (Math.random() - 0.5) * BLOCK_SIZE; // Move along the Z road segment
        }
    }

    // Ensure bounds
    x = Math.max(-halfCity + 10, Math.min(halfCity - 10, x));
    z = Math.max(-halfCity + 10, Math.min(halfCity - 10, z));

    return { x, y: 0.5, z };
}

questions.forEach(q => {
    q.position = getSafePosition(q.id);
});

// In-memory cache for performance, sync with Firestore
const TEAMS = new Map(); // code -> teamObj
const PLAYERS = new Map(); // socketId -> playerObj

// Helper: Generate 6-char code
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// Middleware for Socket Auth
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            socket.user = decodedToken;
            next();
        } catch (err) {
            console.error("Auth Error:", err.message);
            next(new Error("Authentication error"));
        }
    } else {
        next(new Error("Authentication error"));
    }
});

// Public Leaderboard API
app.get('/api/leaderboard', (req, res) => {
    res.json(getLeaderboard());
});

io.on('connection', async (socket) => {
    console.log('User connected:', socket.id, socket.user ? socket.user.email : 'Guest');

    // Auto-Rejoin Logic
    if (socket.user) {
        try {
            const userDoc = await db.collection('users').doc(socket.user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.teamCode) {
                    const teamCode = userData.teamCode;
                    const teamDoc = await db.collection('teams').doc(teamCode).get();
                    if (teamDoc.exists) {
                        const team = teamDoc.data();

                        // Sync Cache
                        if (!TEAMS.has(teamCode)) TEAMS.set(teamCode, team);
                        PLAYERS.set(socket.id, { id: socket.id, uid: socket.user.uid, name: userData.displayName, teamCode: teamCode });

                        socket.join(teamCode);
                        socket.emit('teamJoined', { code: teamCode, teamName: team.name, isLeader: team.leaderUid === socket.user.uid });
                        socket.emit('syncSolved', team.solvedQuestions || []);
                        console.log(`Auto-rejoined ${socket.user.email} to team ${teamCode}`);
                    }
                }
            }
        } catch (e) {
            console.error("Auto-rejoin failed:", e);
        }
    }

    // 1. Team Management
    socket.on('createTeam', async ({ playerName, teamName }) => {
        try {
            const code = generateCode();
            const newTeam = {
                code: code,
                name: teamName,
                leaderUid: socket.user.uid,
                score: 0,
                members: [socket.user.uid],
                solvedQuestions: []
            };

            // Firestore
            await db.collection('teams').doc(code).set(newTeam);
            await db.collection('users').doc(socket.user.uid).update({ teamCode: code });

            // Cache
            TEAMS.set(code, newTeam);
            PLAYERS.set(socket.id, { id: socket.id, uid: socket.user.uid, name: playerName, teamCode: code });

            socket.join(code);
            socket.emit('teamJoined', { code: code, teamName: teamName, isLeader: true });
            io.emit('leaderboardUpdate', getLeaderboard());
        } catch (e) {
            console.error("Error creating team:", e);
            socket.emit('error', { message: "Failed to create team" });
        }
    });

    socket.on('joinTeam', async ({ playerName, teamCode }) => {
        try {
            // Check cache first, then DB
            let team = TEAMS.get(teamCode);
            if (!team) {
                const doc = await db.collection('teams').doc(teamCode).get();
                if (doc.exists) {
                    team = doc.data();
                    TEAMS.set(teamCode, team);
                }
            }

            if (team) {
                // Update Firestore
                await db.collection('teams').doc(teamCode).update({
                    members: admin.firestore.FieldValue.arrayUnion(socket.user.uid)
                });
                await db.collection('users').doc(socket.user.uid).update({ teamCode: teamCode });

                // Update Cache
                if (!team.members.includes(socket.user.uid)) {
                    team.members.push(socket.user.uid);
                }

                PLAYERS.set(socket.id, { id: socket.id, uid: socket.user.uid, name: playerName, teamCode: teamCode });

                socket.join(teamCode);
                socket.emit('teamJoined', { code: teamCode, teamName: team.name, isLeader: team.leaderUid === socket.user.uid });

                // Send solved state for this team
                socket.emit('syncSolved', team.solvedQuestions || []);
            } else {
                socket.emit('error', { message: "Invalid Team Code" });
            }
        } catch (e) {
            console.error("Error joining team:", e);
            socket.emit('error', { message: "Failed to join team" });
        }
    });

    // 2. Game Logic
    socket.on('requestGameState', () => {
        // Send all questions (masking answers ideally, but here we send all)
        // Client filters out solved based on local state or we filter here
        // For simplicity, send all, client hides solved ones.
        socket.emit('gameState', questions);

        // Also sync team specific solved status
        const player = PLAYERS.get(socket.id);
        if (player) {
            const team = TEAMS.get(player.teamCode);
            if (team && team.solvedQuestions) {
                socket.emit('syncSolved', team.solvedQuestions);
            }
        }
    });

    socket.on('attemptAnswer', async ({ questionId, answer }) => {
        console.log(`[Attempt] User:${socket.user.email} Q:${questionId} Ans:${answer}`);

        const player = PLAYERS.get(socket.id);
        if (!player) return;

        const question = questions.find(q => q.id === questionId);
        if (question) {
            const team = TEAMS.get(player.teamCode);
            if (team) {
                // Check if already solved by team
                if (team.solvedQuestions && team.solvedQuestions.includes(questionId)) {
                    socket.emit('answerResult', { correct: false, message: "Already Solved" });
                    return;
                }

                if (question.answer.toLowerCase() === String(answer).toLowerCase().trim()) {
                    // Correct
                    const points = 100;

                    // Update Firestore
                    await db.collection('teams').doc(player.teamCode).update({
                        score: admin.firestore.FieldValue.increment(points),
                        solvedQuestions: admin.firestore.FieldValue.arrayUnion(questionId)
                    });

                    // Update Cache
                    team.score += points;
                    if (!team.solvedQuestions) team.solvedQuestions = [];
                    team.solvedQuestions.push(questionId);

                    // Broadcast
                    io.emit('questionSolved', {
                        questionId: question.id,
                        teamName: team.name,
                        solverName: player.name,
                        teamCode: player.teamCode // To let clients know which team solved it
                    });

                    io.emit('leaderboardUpdate', getLeaderboard());
                    socket.emit('answerResult', { correct: true });
                } else {
                    socket.emit('answerResult', { correct: false });
                }
            }
        }
    });

    // 3. Player Movement (Teammate Sync)
    socket.on('playerMove', (data) => {
        const player = PLAYERS.get(socket.id);
        if (player && player.teamCode) {
            // Broadcast to team room, excluding sender
            socket.to(player.teamCode).emit('teammateUpdate', {
                id: socket.user.uid,
                name: player.name,
                x: data.x,
                y: data.y,
                z: data.z,
                rot: data.rot
            });
        }
    });

    socket.on('disconnect', () => {
        const player = PLAYERS.get(socket.id);
        if (player && player.teamCode) {
            socket.to(player.teamCode).emit('teammateDisconnect', socket.user.uid);
        }
        PLAYERS.delete(socket.id);
        console.log('User disconnected:', socket.id);
    });
});

function getLeaderboard() {
    return Array.from(TEAMS.values())
        .map(t => ({ name: t.name, score: t.score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
