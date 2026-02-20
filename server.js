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
    {
        id: 1,
        question: "This audio file sounds like static noise, but perhaps you’re looking at it the wrong way. Don't just listen—look at the sound.<br><br>Method: Use a tool like AudioPaint or Coagula to turn an image of text into a WAV file. When viewed in a Spectrogram (using Audacity), the text appears.<br><br><a href='https://drive.google.com/file/d/1WEEu48om3dtKn0rHF9kWaDxkVeCtwauk/view?usp=drive_link' target='_blank'>Download Audio File</a>",
        answer: "isteCTF{v1su4l_v1brati0ns}",
        position: { x: 0, y: 1, z: -10 },
        isSolved: false
    },
    {
        id: 2,
        question: "The suspect sent this audio file to his accomplice. It sounds like just white noise and beeping, but we know there's text hidden inside. It's not Morse code.<br><br>Setup: Use a tool like DeepSound or Coagula to find the hidden text. Alternatively, open the audio in Audacity and switch to Spectrogram View to see the letters of the flag drawn in the sound waves.<br><br><a href='https://drive.google.com/file/d/1gUDS28HJTXURwun2r_yuMx2eROcye6AY/view?usp=drivesdk' target='_blank'>Download Audio File</a>",
        answer: "isteCTF{s33_th3_s0und_w@v3s}",
        position: { x: 10, y: 1, z: 0 },
        isSolved: false
    },
    {
        id: 3,
        question: "This image of the Thapar University gate looks perfectly normal. Even if you turn up the brightness, nothing changes. But the red channel has a slight 'shiver' in its values.<br><br>The Setup:<br>Take a high-res photo.<br>Change the Red value of the first 20 pixels by just 1 unit (e.g., from 255 to 254) if the bit is 1, and leave it if it's 0.<br>This is a classic 'LSB Steganography' attack.<br><br><a href='https://drive.google.com/file/d/1xmQMnqsazQPTr7_cZb5iM-MV26m0ORIU/view?usp=drive_link' target='_blank'>Download Image</a>",
        answer: "isteCTF{lsb_p1x3l_m4n1pul4t10n}",
        position: { x: -10, y: 1, z: 0 },
        isSolved: false
    },
    { id: 4, question: "The file is broken. The password is lost. The flag is buried. You have 3 layers of security to peel back. Can you find the 'Ghost in the Image'?<br><br><a href='https://drive.google.com/file/d/1x65T0p9l0TNbtpcck1CAWSRceIOhrOaH/view?usp=drive_link' target='_blank'>Open</a>", answer: "isteCTF{n3st3d_m4tr3ry0shka_d0ll}", position: { x: 0, y: 1, z: 10 }, isSolved: false },
    { id: 5, question: "Our lead developer posted a screenshot of his new workspace, but he didn't realize his 'Pastebin' was visible in the reflection of his monitor. Find the link, find the flag.<br><br><a href='https://drive.google.com/file/d/1smGrYO-JJuBJBI4gCJ5zia3-fcnJvuWo/view?usp=drive_link' target='_blank'>Open</a>", answer: "isteCTF{0SINT_is_w4tching}", position: { x: 5, y: 1, z: 5 }, isSolved: false },
    { id: 6, question: "This image looks like a solid black square. Some say it's modern art; we say it's a cover-up. Can you bring the light to the darkness?<br><br><a href='https://drive.google.com/file/d/1nqAh-Euhhm-R7jOldEGBTBK_kVyrXXc5/view?usp=drive_link' target='_blank'>Open</a>", answer: "isteCTF{l1ght_in_th3_dark}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 7, question: " An old voicemail from the past has resurfaced. At first, it sounds like meaningless noise—but history has a habit of repeating itself. Can you hear what time tried to hide?<br><br><a href='https://drive.google.com/file/d/1nRcNWD1Bu51A09Fkbrll8uWMMKudxRnz/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{r3v3r53_th3_p4st}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 8, question: "Two posters from different eras look identical. But has history been edited? Find the anomaly.<br><br><a href='https://drive.google.com/file/d/1I_0hmSOzzg4BxIM8qFuvLNvLj5f0eOnd/view?usp=sharing' target='_blank'>Image-1</a><br><br><a href='https://drive.google.com/file/d/1JtMfwWMv9X8RDZ0w6j8JPN-eUaGO3C_I/view?usp=sharing' target='_blank'>Image-2</a>", answer: "isteCTF{sp0t_th3_ch4ng3}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 9, question: "An image recovered from an obsolete system looks normal—but legends say it contains another file inside a file inside a file. How deep does time go?<br><br><a href='https://drive.google.com/file/d/1tJZbgVcojKX0FNWBCNnoFxHKsHwhyAja/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{l4y3rs_0f_t1m3}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 10, question: "You intercepted a corrupted image from a compromised server.<br>The image opens normally, but forensic logs suggest the file size is larger than expected. Something was hidden in plain sight. Investigate the file carefully. The truth is appended, not embedded.<br><br><a href='https://drive.google.com/file/d/1vf-fLKZSmw3JPOrkJufe26S3tqfzFJFl/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{fr4gm3nt3d_r34l1ty_2026}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 11, question: "An image recovered from an obsolete system looks normal—but legends say it contains another file inside a file inside a file. How deep does time go?<br><br><a href='https://drive.google.com/file/d/1tJZbgVcojKX0FNWBCNnoFxHKsHwhyAja/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{l4y3rs_0f_t1m3}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 12, question: "The waveform looks structured but meaningless. What if the message flows backward in time?<br><br><a href='https://drive.google.com/file/d/1IWxZeCnZrl65eKM6rXbdOOjQc9sFEAKg/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{r3v3rs3_th3_w4v3}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 13, question: "The binary dump contains no readable strings.But encryption leaves patterns. Find the shadow key.<br><br><a href='https://drive.google.com/file/d/1zS56br9p0zXmS_2ETAaG-og-wvuQ0I6U/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{x0r_sh4d0w_crypt}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 14, question: "A memory dump fragment was recovered.It’s mostly random noise. But noise sometimes hides signals.<br><br><a href='https://drive.google.com/file/d/1NGEcVwTkDlg7xyay_tYFdg4tBJqfjGsW/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{b1n4ry_gh0st_pr0t0c0l}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 15, question: "A password-protected PDF has surfaced. Within the text lies something you might not expect. Can you uncover the secret and claim the flag?<br><br><a href='https://drive.google.com/file/d/1Rjicm4XR1slWoKOcxAw-z4cQ6Wsajj4i/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{morsecodeftw}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 16, question: "A massive file named bigZip  has surfaced. Inside, there’s something important—but it’s buried beneath layers. Can you extract the truth hidden within?<br><br><a href='https://drive.google.com/file/d/1_PWUl9TdAti76jDsOWnLaFE-vhndbLvc/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{se@rch3d_@_l0t_343fdr43efscd2}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 17, question: "You’ve encountered two images, both seemingly identical, yet something is hidden in plain sight. Can you discern which one holds the key?<br><br><a href='https://drive.google.com/drive/folders/1DrOgx5LXJEfo_HoSkG_ZUsfhWqNKDukj?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{blurry}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 18, question: "A mysterious music cipher has appeared, its melody holding the key to the next stage. Can you uncover the message hidden within?<br><br><a href='https://drive.google.com/file/d/1YTjic49No3m21mzQ1r3WEWDm3WffEomp/view?usp=sharing' target='_blank'>Open</a>", answer: "isteCTF{music}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 19, question: "A song file is waiting to be decoded. Can you translate the notes and uncover its melody?<br><br><a href='https://drive.google.com/file/d/1jCDiNGuDTv2dh82_8JO3GIu9pVVCZk9C/view?usp=drive_link' target='_blank'>Open</a>", answer: "isteCTF{doyouknowhowtoplaymusicwithyourkeyboard}", position: { x: 0, y: 0, z: 0 }, isSolved: false },
    { id: 20, question: "A simple website, a deeper mystery. Will you uncover what’s waiting to be found? <br><br><a href='https://web-flag1.vercel.app/' target='_blank'>Open</a>", answer: "isteCTF{console_da_best}", position: { x: 0, y: 0, z: 0 }, isSolved: false }
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

// Assign positions with spacing check
const assignedPositions = [];
questions.forEach(q => {
    let attempts = 0;
    let pos;
    let valid = false;

    while (!valid && attempts < 10) {
        pos = getSafePosition(q.id);

        // Check distance to others
        const tooClose = assignedPositions.some(p => {
            const dx = p.x - pos.x;
            const dz = p.z - pos.z;
            return Math.sqrt(dx * dx + dz * dz) < 30; // Min spacing 30
        });

        if (!tooClose) valid = true;
        attempts++;
    }

    q.position = pos;
    assignedPositions.push(pos);
});

// In-memory cache for performance, sync with Firestore
const TEAMS = new Map(); // code -> teamObj
const PLAYERS = new Map(); // socketId -> playerObj

// Helper: Generate 6-char code
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    console.log("Generated Code:", code);
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
                        socket.emit('teamJoined', {
                            code: teamCode,
                            teamName: team.name,
                            isLeader: team.leaderUid === socket.user.uid,
                            score: team.score
                        });
                        console.log(`Auto-rejoined ${socket.user.email} -> Team: ${teamCode}, Score: ${team.score}`);
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
            // Check for duplicate name (Case insensitive)
            const exists = Array.from(TEAMS.values()).some(t => t.name.toLowerCase() === teamName.toLowerCase());
            if (exists) {
                socket.emit('error', { message: "Team Name Already Taken" });
                return;
            }

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
            // Use set with merge to create user doc if it doesn't exist
            await db.collection('users').doc(socket.user.uid).set({
                teamCode: code,
                email: socket.user.email,
                displayName: playerName
            }, { merge: true });

            // Cache
            TEAMS.set(code, newTeam);
            PLAYERS.set(socket.id, { id: socket.id, uid: socket.user.uid, name: playerName, teamCode: code });

            socket.join(code);
            socket.emit('teamJoined', {
                code: code,
                teamName: teamName,
                isLeader: true,
                score: 0
            });
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
                // Use set with merge to create user doc if it doesn't exist
                await db.collection('users').doc(socket.user.uid).set({
                    teamCode: teamCode,
                    email: socket.user.email,
                    displayName: playerName
                }, { merge: true });

                // Update Cache
                if (!team.members.includes(socket.user.uid)) {
                    team.members.push(socket.user.uid);
                }

                PLAYERS.set(socket.id, { id: socket.id, uid: socket.user.uid, name: playerName, teamCode: teamCode });

                socket.join(teamCode);
                socket.emit('teamJoined', {
                    code: teamCode,
                    teamName: team.name,
                    isLeader: team.leaderUid === socket.user.uid,
                    score: team.score // Send initial score
                });

                // Send solved state for this team
                socket.emit('syncSolved', team.solvedQuestions || []);

                // Broadcast Leaderboard update so new member appears immediately
                io.emit('leaderboardUpdate', getLeaderboard());
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
        // Send questions preventing answer leakage
        const sanitizedQuestions = questions.map(q => ({
            id: q.id,
            question: q.question,
            position: q.position,
            isSolved: q.isSolved
        }));
        socket.emit('gameState', sanitizedQuestions);

        // Also sync team specific solved status
        const player = PLAYERS.get(socket.id);
        if (player) {
            const team = TEAMS.get(player.teamCode);
            if (team && team.solvedQuestions) {
                socket.emit('syncSolved', team.solvedQuestions);
            }
        }
    });

    // 3. Player Movement (Teammate Sync)
    socket.on('playerMove', (data) => {
        const player = PLAYERS.get(socket.id);
        if (player && player.teamCode) {
            // Anti-Cheat: Speed Check
            const now = Date.now();
            const lastPos = player.lastPos || { x: 0, y: 0, z: 0 };
            const lastTime = player.lastTime || now;

            // Initial move or long gap: just update
            if (!player.lastPos || (now - lastTime) > 2000) {
                player.lastPos = { x: data.x, y: data.y, z: data.z };
                player.lastTime = now;
            } else {
                const dt = (now - lastTime) / 1000; // seconds
                if (dt > 0) {
                    const dist = Math.sqrt(
                        Math.pow(data.x - lastPos.x, 2) +
                        Math.pow(data.y - lastPos.y, 2) +
                        Math.pow(data.z - lastPos.z, 2)
                    );
                    const speed = dist / dt;

                    // Max speed ~25 units/s (Player speed is 15, allow buffer/lag)
                    if (speed > 30) {
                        // console.warn(`Speed warning: ${player.name} moving at ${speed.toFixed(2)} u/s`);
                        // Optionally correct them back or ignore
                        // For now, we process it but could flag it
                    }

                    player.lastPos = { x: data.x, y: data.y, z: data.z };
                    player.lastTime = now;
                }
            }

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

    socket.on('attemptAnswer', async ({ questionId, answer }) => {
        console.log(`[Attempt] User:${socket.user.email} Q:${questionId} Ans:${answer}`);

        const player = PLAYERS.get(socket.id);
        if (!player) return;

        const question = questions.find(q => q.id === questionId);
        if (question) {
            // Anti-Cheat: Proximity Check
            if (player.lastPos) {
                const distToFlag = Math.sqrt(
                    Math.pow(player.lastPos.x - question.position.x, 2) +
                    Math.pow(player.lastPos.z - question.position.z, 2)
                );
                // Allow some buffer (e.g., 8 units)
                if (distToFlag > 10) {
                    socket.emit('answerResult', { correct: false, message: "Too far from flag!" });
                    console.warn(`[Suspicious] ${player.name} answered Q${questionId} from distance ${distToFlag.toFixed(1)}`);
                    return;
                }
            }

            const team = TEAMS.get(player.teamCode);
            if (team) {
                // Check if already solved by team
                if (team.solvedQuestions && team.solvedQuestions.includes(questionId)) {
                    socket.emit('answerResult', { correct: false, message: "Already Solved" });
                    return;
                }

                if (question.answer.toLowerCase() === String(answer).toLowerCase().trim()) {
                    // Correct
                    const points = 200;
                    const now = admin.firestore.Timestamp.now();

                    try {
                        await db.runTransaction(async (t) => {
                            const teamRef = db.collection('teams').doc(player.teamCode);
                            const teamDoc = await t.get(teamRef);
                            if (!teamDoc.exists) throw "Team does not exist";

                            const tData = teamDoc.data();
                            if (tData.solvedQuestions && tData.solvedQuestions.includes(questionId)) {
                                throw "Already solved by team (race condition)";
                            }

                            t.update(teamRef, {
                                score: admin.firestore.FieldValue.increment(points),
                                solvedQuestions: admin.firestore.FieldValue.arrayUnion(questionId),
                                lastScoredAt: now
                            });
                        });

                        // Update Cache
                        team.score += points;
                        if (!team.solvedQuestions) team.solvedQuestions = [];
                        team.solvedQuestions.push(questionId);
                        team.lastScoredAt = now;

                        // Broadcast
                        io.emit('questionSolved', {
                            questionId: question.id,
                            teamName: team.name,
                            solverName: player.name,
                            teamCode: player.teamCode
                        });

                        io.emit('leaderboardUpdate', getLeaderboard());
                        socket.emit('answerResult', { correct: true });

                    } catch (e) {
                        console.error("Transaction failure:", e);
                        socket.emit('answerResult', { correct: false, message: "Error or Already Solved" });
                    }
                } else {
                    console.log(`Entered incorrect answer: "${answer}"`);
                    socket.emit('answerResult', { correct: false });
                }
            }
        }
    });

    // 4. Combat Scoring
    socket.on('enemyKill', async () => {
        const player = PLAYERS.get(socket.id);
        if (!player || !player.teamCode) return;

        const points = 5;
        const teamCode = player.teamCode;
        const team = TEAMS.get(teamCode);

        if (team) {
            try {
                // Firestore Update
                await db.collection('teams').doc(teamCode).update({
                    score: admin.firestore.FieldValue.increment(points)
                });
                // Cache Update
                team.score += points;
                io.emit('leaderboardUpdate', getLeaderboard());
            } catch (e) {
                console.error("Score update failed:", e);
            }
        }
    });

    socket.on('playerDeath', async () => {
        const player = PLAYERS.get(socket.id);
        if (!player || !player.teamCode) return;

        const points = -5; // Deduct
        const teamCode = player.teamCode;
        const team = TEAMS.get(teamCode);

        if (team) {
            try {
                // Firestore Update
                await db.collection('teams').doc(teamCode).update({
                    score: admin.firestore.FieldValue.increment(points)
                }); // Can go negative? Yes.

                // Cache Update
                team.score += points;
                io.emit('leaderboardUpdate', getLeaderboard());
            } catch (e) {
                console.error("Score update failed:", e);
            }
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

async function loadTeams() {
    try {
        console.log("Loading teams from Firestore...");
        TEAMS.clear(); // Ensure clean slate
        const snapshot = await db.collection('teams').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            TEAMS.set(doc.id, data);
            console.log(`- Loaded Team: ${data.name} (${data.score} pts)`);
        });
        console.log(`Loaded ${TEAMS.size} teams into cache.`);
    } catch (e) {
        console.error("Failed to load teams:", e);
    }
}

loadTeams().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log("Don't try to hack this game. If caught hacking then your team will be disqualified.");
        console.log("Developed by Happy Singh Rajpurohit");
    });
});
