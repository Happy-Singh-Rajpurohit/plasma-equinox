import * as THREE from 'three';
import { io } from "socket.io-client";
import { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut, doc, setDoc, sendPasswordResetEmail } from "./firebaseConfig.js";

// Constants
const PLAYER_SPEED = 15.0;
const CITY_SIZE = 220;
const BLOCK_SIZE = 20;

// Globals
// Globals
let camera, scene, renderer;
let socket;
let raycaster;
const flags = new Map();
const npcMeshes = [];
const collidables = [];
let player;
let cameraTarget;
let isGameActive = false;
let isAuthenticated = false; // New flag
let interactableFlag = null;
let currentUser = null;

// UI Elements
const uiLayer = document.getElementById('ui-layer');
const loginScreen = document.getElementById('login-screen');
const authForms = document.getElementById('auth-forms');
const gameHud = document.getElementById('game-hud');
const modal = document.getElementById('question-modal');
const qText = document.getElementById('q-text');
const qInput = document.getElementById('q-answer');
const qSubmit = document.getElementById('q-submit');
const qCancel = document.getElementById('q-cancel');
const scoreEl = document.getElementById('team-score');
const instructions = document.getElementById('instructions-mini'); // Updated ID

// Auth Inputs
// Auth Inputs
const inputEmail = document.getElementById('auth-email');
const inputPass = document.getElementById('auth-password');
const inputRoll = document.getElementById('auth-roll');
const inputName = document.getElementById('auth-name'); // Renamed from player-name in HTML update? Validating...
// HTML has id="auth-name" in register-fields. Old id was "player-name".
// I need to be careful with existing variables.
// Let's re-map them based on my index.html changes.

const stepAuth = document.getElementById('step-auth');
const btnLogin = document.getElementById('btn-login');
const btnShowRegister = document.getElementById('btn-show-register');
const btnRegisterSubmit = document.getElementById('btn-register-submit');
const btnAuthBack = document.getElementById('btn-auth-back');
const registerFields = document.getElementById('register-fields');
const btnLogout = document.getElementById('btn-logout');

const btnCreate = document.getElementById('btn-create-team');
const btnJoin = document.getElementById('btn-join-team');
const stepName = document.getElementById('step-name');
const stepTeam = document.getElementById('step-team');
const stepJoin = document.getElementById('step-join');
const stepCreate = document.getElementById('step-create');
const inputTeamCode = document.getElementById('team-code-input');
const inputTeamName = document.getElementById('new-team-name');
const btnSubmitJoin = document.getElementById('btn-submit-join');
const btnSubmitCreate = document.getElementById('btn-submit-create');
const errorMsg = document.getElementById('auth-error');
const backBtns = document.querySelectorAll('.btn-back');

let solvedCount = 0;

// Inputs
const keyState = {};
let mouseX = 0;
let mouseY = 0;


function init() {
    console.log("Init called - Contest Mode");

    // 1. Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510); // Darker night background
    scene.fog = new THREE.FogExp2(0x050510, 0.005);

    // 2. Setup Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 50, 100); // High initial view
    camera.lookAt(0, 0, 0);

    // 3. Setup Lights
    const hemiLight = new THREE.HemisphereLight(0x050510, 0x111122, 1.5); // Increased from 0.5
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xaaccff, 1.5); // Increased from 0.5
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 4. Setup Player
    createPlayer();

    // 5. Setup Input
    setupInput();

    // 6. Raycaster
    raycaster = new THREE.Raycaster();

    // 7. City
    generateCity();

    // 8. NPCs
    initNPCs(40);

    // 9. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);

    // 10. Socket (Delayed until Auth)
    // setupSocket(); 


    // 11. UI
    setupUI(); // New Logic

    // 12. Cars - REMOVED

    // 13. Public Leaderboard
    fetchLeaderboard();
    setInterval(fetchLeaderboard, 10000); // Poll every 10s
}

async function fetchLeaderboard() {
    if (isAuthenticated) return; // Don't poll if logged in (socket handles it)
    try {
        const res = await fetch('/api/leaderboard');
        const data = await res.json();
        const list = document.getElementById('public-leaderboard-list');
        if (list) {
            list.innerHTML = data.map((t, i) => `
                <li style="display: flex; justify-content: space-between; margin-bottom: 4px; color: ${i === 0 ? '#ffd700' : '#fff'}">
                    <span>${i + 1}. ${t.name.toUpperCase()}</span>
                    <span>${t.score} PTS</span>
                </li>
            `).join('');
        }
    } catch (e) { console.error("Leaderboard fetch failed", e); }
}


const teammates = new Map(); // uid -> { mesh }
let lastPosEmit = 0;

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
        const time = performance.now();
        const delta = Math.min((time - (init.lastTime || time)) / 1000, 0.1);
        init.lastTime = time;

        if (isAuthenticated) {
            // Game Active
            if (isGameActive) {
                updatePlayer(delta);
            }
            updateCamera();
        } else {
            // Login Screen Orbit
            const r = 100;
            const speed = 0.0001;
            camera.position.x = r * Math.sin(time * speed);
            camera.position.z = r * Math.cos(time * speed);
            camera.position.y = 50;
            camera.lookAt(0, 0, 0);
        }

        // NPCs
        npcMeshes.forEach(n => {
            n.mesh.position.addScaledVector(n.dir, 3 * delta);
            const margin = CITY_SIZE / 2;
            if (Math.abs(n.mesh.position.x) > margin || Math.abs(n.mesh.position.z) > margin) {
                n.dir.negate();
            }
        });


        renderer.render(scene, camera);
    }
}

function createPlayer() {
    const group = new THREE.Group();

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x2244aa });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), shirtMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const leftArm = new THREE.Mesh(armGeo, shirtMat);
    leftArm.position.set(-0.45, 1.15, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, shirtMat);
    rightArm.position.set(0.45, 1.15, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.2, 0.4, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.2, 0.4, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    scene.add(group);

    player = {
        mesh: group,
        velocity: new THREE.Vector3(),
        rotation: 0,
        parts: {
            leftArm, rightArm, leftLeg, rightLeg
        },
        walkTime: 0,
        onGround: false // Ensure onGround is initialized
    };

    // Camera Target
    cameraTarget = new THREE.Object3D();
    cameraTarget.position.set(0, 2.5, 0);
    group.add(cameraTarget);

    // Flashlight / Spotlight
    const spotLight = new THREE.SpotLight(0xffffff, 2);
    spotLight.position.set(0, 2, 0);
    spotLight.target.position.set(0, 0, 10);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.3;
    spotLight.distance = 60;
    spotLight.castShadow = true;
    group.add(spotLight);
    group.add(spotLight.target);
}

function setupInput() {
    console.log("setupInput called");
    document.addEventListener('keydown', (e) => {
        if (!isAuthenticated) return;
        keyState[e.code] = true;
        if (e.code === 'KeyE') tryInteract();
    });
    document.addEventListener('keyup', (e) => keyState[e.code] = false);

    document.body.addEventListener('mousemove', (e) => {
        if (!isGameActive || !isAuthenticated) return;
        const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
        const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

        mouseX -= movementX * 0.002;
        mouseY -= movementY * 0.002;

        // Clamp Pitch - prevent looking too far up or down
        // Also need to ensure camera doesn't go below ground in updateCamera
        mouseY = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, mouseY));
    });

    document.addEventListener('click', () => {
        if (isAuthenticated && !isGameActive && modal.classList.contains('hidden')) {
            document.body.requestPointerLock();
            isGameActive = true;
        }
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== document.body) {
            isGameActive = false;
        }
    });

    // Start with default view
    mouseX = Math.PI; // Face forward
    mouseY = 0.2;
}

function updateCamera() {
    // Camera orbital position calculated from mouseX/mouseY around player
    if (!player) return;
    const dist = 8;
    const height = 4;

    const cx = player.mesh.position.x + dist * Math.sin(mouseX) * Math.cos(mouseY);
    const cz = player.mesh.position.z + dist * Math.cos(mouseX) * Math.cos(mouseY);
    let cy = player.mesh.position.y + height + dist * Math.sin(mouseY);

    // Constraint: Minimum Height (Ground Level + Buffer)
    if (cy < 0.5) cy = 0.5;

    camera.position.set(cx, cy, cz);
    camera.lookAt(player.mesh.position.x, player.mesh.position.y + 2, player.mesh.position.z);
}

function checkCollision(position) {
    const playerBox = new THREE.Box3();
    const size = 0.5;
    playerBox.min.set(position.x - size, position.y, position.z - size);
    playerBox.max.set(position.x + size, position.y + 2, position.z + size);

    for (const box of collidables) {
        if (playerBox.intersectsBox(box)) {
            return true;
        }
    }
    return false;
}

function updatePlayer(delta) {
    if (!player) return;
    const moveDir = new THREE.Vector3(0, 0, 0);

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    const camRight = new THREE.Vector3();
    camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0));

    if (keyState['KeyW'] || keyState['ArrowUp']) moveDir.add(camDir);
    if (keyState['KeyS'] || keyState['ArrowDown']) moveDir.sub(camDir);
    if (keyState['KeyA'] || keyState['ArrowLeft']) moveDir.sub(camRight);
    if (keyState['KeyD'] || keyState['ArrowRight']) moveDir.add(camRight);

    // Emit Position for Teammates
    const now = performance.now();
    if (now - lastPosEmit > 100) { // 10Hz
        lastPosEmit = now;
        if (socket && isAuthenticated) {
            socket.emit('playerMove', {
                x: player.mesh.position.x,
                y: player.mesh.position.y,
                z: player.mesh.position.z,
                rot: player.mesh.rotation.y
            });
        }
    }

    if (moveDir.lengthSq() > 0) {
        moveDir.normalize();

        const targetRot = Math.atan2(moveDir.x, moveDir.z);
        let rotDiff = targetRot - player.mesh.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        player.mesh.rotation.y += rotDiff * 10 * delta;

        let speedMultiplier = 1.0;
        if (keyState['ShiftLeft'] || keyState['ShiftRight']) {
            speedMultiplier = 2.0;
        }

        const visualSpeed = PLAYER_SPEED * speedMultiplier;
        const potentialPos = player.mesh.position.clone().addScaledVector(moveDir, visualSpeed * delta);

        const margin = CITY_SIZE / 2;
        potentialPos.x = Math.max(-margin, Math.min(margin, potentialPos.x));
        potentialPos.z = Math.max(-margin, Math.min(margin, potentialPos.z));

        if (!checkCollision(potentialPos)) {
            player.mesh.position.x = potentialPos.x;
            player.mesh.position.z = potentialPos.z;

            player.walkTime += delta * 10 * speedMultiplier;
            const swing = Math.sin(player.walkTime) * 0.4;

            player.parts.leftLeg.rotation.x = swing;
            player.parts.rightLeg.rotation.x = -swing;
            player.parts.leftArm.rotation.x = -swing;
            player.parts.rightArm.rotation.x = swing;
        }
    } else {
        player.parts.leftLeg.rotation.x = 0;
        player.parts.rightLeg.rotation.x = 0;
        player.parts.leftArm.rotation.x = 0;
        player.parts.rightArm.rotation.x = 0;
    }

    if (player.onGround && keyState['Space']) {
        player.velocity.y = 15.0;
        player.onGround = false;
    }

    player.velocity.y -= 40.0 * delta;
    player.mesh.position.y += player.velocity.y * delta;

    if (player.mesh.position.y < 0) {
        player.mesh.position.y = 0;
        player.velocity.y = 0;
        player.onGround = true;
    }
    // Check for Flag Interaction
    interactableFlag = null;
    let closestDist = Infinity;

    for (const [id, flag] of flags) {
        const dist = player.mesh.position.distanceTo(flag.mesh.position);
        if (dist < 3.0 && dist < closestDist) {
            closestDist = dist;
            interactableFlag = flag;
        }
    }

    if (interactableFlag) {
        instructions.innerText = "PRESS [E] TO DECRYPT";
        instructions.style.color = "#00ff00";
    } else {
        instructions.innerText = "WASD to Move | E to Interact";
        instructions.style.color = "rgba(255, 255, 255, 0.7)";
    }
}

function tryInteract() {
    if (!isGameActive) return;
    if (interactableFlag) {
        openModal(interactableFlag.data);
    }
}

const ROAD_WIDTH = 10;
const UNIT_SIZE = BLOCK_SIZE + ROAD_WIDTH;
const ROADS = { x: [], z: [] }; // Store road coordinates

function generateCity() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(CITY_SIZE + 400, CITY_SIZE + 400);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x050510 }); // Dark background for gaps
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.position.y = -0.1;
    scene.add(ground);

    // Realistic Road Material (Asphalt)
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 128; roadCanvas.height = 128;
    const ctx = roadCanvas.getContext('2d');
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 128, 128);
    // Add noise
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#2a2a2a' : '#1a1a1a';
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const roadTex = new THREE.CanvasTexture(roadCanvas);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(CITY_SIZE / 10, CITY_SIZE / 10);

    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x555555 }); // Darker sidewalk
    const buildingColors = [0xeeeeee, 0xdddddd, 0xcccccc, 0xbbbbbb, 0x8899aa];

    const halfCity = CITY_SIZE / 2;

    // Road Base
    const roadBase = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE).rotateX(-Math.PI / 2),
        roadMat
    );
    roadBase.position.y = 0.02;
    roadBase.receiveShadow = true;
    scene.add(roadBase);

    // Grid Generation with Zones
    for (let x = -halfCity; x < halfCity; x += UNIT_SIZE) {
        // Track Road Lines (Center of the gap)
        ROADS.x.push(x - ROAD_WIDTH / 2);

        for (let z = -halfCity; z < halfCity; z += UNIT_SIZE) {
            if (x === -halfCity) ROADS.z.push(z - ROAD_WIDTH / 2);

            // Coordinates for Building Block Center
            const bx = x + BLOCK_SIZE / 2;
            const bz = z + BLOCK_SIZE / 2;

            // Streetlights at intersections (offset to corners)
            if (Math.random() > 0.6) createStreetLight(x - 5, z - 5);

            // ZONES
            const distFromCenter = Math.sqrt(bx * bx + bz * bz);

            // 1. Central Park / Plaza (Safe Zone)
            if (Math.abs(bx) < 40 && Math.abs(bz) < 40) {
                if (Math.abs(bx) < 10 && Math.abs(bz) < 10) {
                    // Spawn Point - Empty
                } else {
                    createPark(bx, bz, BLOCK_SIZE);
                }
                continue;
            }

            // 2. Downtown (Tall Glass Skyscrapers)
            if (distFromCenter < 100 && (Math.abs(bx) < 40 || Math.abs(bz) < 40)) {
                createSkyscraper(bx, bz, BLOCK_SIZE, sidewalkMat);
                continue;
            }

            // 3. Industrial (Warehouses)
            if (bx > 50) {
                createWarehouse(bx, bz, BLOCK_SIZE, sidewalkMat);
                continue;
            }

            // 4. Residential (Smaller Buildings)
            createResidential(bx, bz, BLOCK_SIZE, sidewalkMat);
        }
    }

    // Add Road Markings (Dashed Lines)
    const lineGeo = new THREE.PlaneGeometry(0.5, 4);
    lineGeo.rotateX(-Math.PI / 2);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffaa }); // Yellow-ish

    // Vertical Markings (along Z)
    ROADS.x.forEach(rx => {
        for (let z = -halfCity; z < halfCity; z += 10) {
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.position.set(rx, 0.03, z);
            scene.add(line);
        }
    });

    // Horizontal Markings (along X)
    const lineGeoH = new THREE.PlaneGeometry(4, 0.5);
    lineGeoH.rotateX(-Math.PI / 2);

    ROADS.z.forEach(rz => {
        for (let x = -halfCity; x < halfCity; x += 10) {
            const line = new THREE.Mesh(lineGeoH, lineMat);
            line.position.set(x, 0.03, rz);
            scene.add(line);
        }
    });
}

function createStreetLight(x, z) {
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    pole.position.set(x, 4, z);
    scene.add(pole);

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    bulb.position.set(x, 7.5, z);
    scene.add(bulb);

    // Add point light for realism (expensive, limit count?)
    // const light = new THREE.PointLight(0xffaa00, 1, 15);
    // light.position.set(x, 7.0, z);
    // scene.add(light);
}

// ... Building Types ...
function createPark(x, z, size) {
    const geo = new THREE.BoxGeometry(size, 0.2, size);
    const mat = new THREE.MeshStandardMaterial({ color: 0x22aa44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.1, z);
    mesh.receiveShadow = true;
    scene.add(mesh);

    for (let i = 0; i < 4; i++) {
        const tx = x + (Math.random() - 0.5) * (size - 2);
        const tz = z + (Math.random() - 0.5) * (size - 2);

        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.3, 1.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x553311 })
        );
        trunk.position.set(tx, 0.75, tz);
        trunk.castShadow = true;
        scene.add(trunk);

        const crown = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.5),
            new THREE.MeshStandardMaterial({ color: 0x116622 })
        );
        crown.position.set(tx, 2.5, tz);
        crown.castShadow = true;
        scene.add(crown);
        collidables.push(new THREE.Box3().setFromObject(trunk));
    }
}

function createSkyscraper(x, z, size, swMat) {
    const height = 30 + Math.random() * 50;
    const geo = new THREE.BoxGeometry(size - 2, height, size - 2);
    const tex = createBuildingTexture();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, height / 10);
    const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.8, roughness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    collidables.push(new THREE.Box3().setFromObject(mesh));
}

function createWarehouse(x, z, size, swMat) {
    const height = 8 + Math.random() * 5;
    const geo = new THREE.BoxGeometry(size - 1, height, size - 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    collidables.push(new THREE.Box3().setFromObject(mesh));
}

function createResidential(x, z, size, swMat) {
    const height = 5 + Math.random() * 10;
    const geo = new THREE.BoxGeometry(size - 4, height, size - 4);
    const mat = new THREE.MeshStandardMaterial({ color: `hsl(${Math.random() * 360}, 30%, 60%)` });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    collidables.push(new THREE.Box3().setFromObject(mesh));
}

function createBuildingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Background - Glassy
    ctx.fillStyle = '#223355';
    ctx.fillRect(0, 0, 128, 256);

    // Windows Lit/Unlit
    for (let y = 10; y < 256; y += 20) {
        for (let x = 10; x < 128; x += 20) {
            if (Math.random() > 0.4) {
                // Lit Window
                ctx.fillStyle = `hsl(${40 + Math.random() * 20}, 100%, 70%)`; // Yellow/Warm
            } else {
                ctx.fillStyle = '#112244'; // Dark
            }
            ctx.fillRect(x, y, 10, 15);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function openModal(data) {
    if (!isGameActive) return;
    isGameActive = false;
    document.exitPointerLock();

    qText.innerText = data.question;
    qInput.value = '';
    modal.classList.remove('hidden');

    // Delay focus and clear again to prevent 'e' from typing
    setTimeout(() => {
        qInput.value = '';
        qInput.focus();
    }, 50);

    // Key Handler
    const keyHandler = (e) => {
        if (e.key === 'Enter') {
            submitAnswer();
            cleanup();
        } else if (e.key === 'Escape') {
            closeModal();
            cleanup();
        }
    };

    const cleanup = () => {
        document.removeEventListener('keydown', keyHandler);
    };

    document.addEventListener('keydown', keyHandler);
}

function submitAnswer() {
    const val = qInput.value;
    if (val && interactableFlag) {
        // We know the question ID from data
        socket.emit('attemptAnswer', { questionId: interactableFlag.data.id, answer: val });
        // Close immediately? Or wait? 
        // Let's close and show result via toast/notification later if needed.
        // For now, simple interaction:
        closeModal();
    }
}

function closeModal() {
    modal.classList.add('hidden');
    document.body.requestPointerLock();
    isGameActive = true;
}

function initNPCs(count) {
    const geo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x880088 });

    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);

        // Random position
        const x = (Math.random() - 0.5) * CITY_SIZE;
        const z = (Math.random() - 0.5) * CITY_SIZE;
        mesh.position.set(x, 1, z);
        mesh.castShadow = true;
        scene.add(mesh);

        const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();

        npcMeshes.push({
            mesh: mesh,
            dir: dir
        });
    }
}

function initCars(count) {
    for (let i = 0; i < count; i++) {
        // Random Type
        const typeRoll = Math.random();
        let type = 'sedan';
        if (typeRoll < 0.2) type = 'truck';
        else if (typeRoll < 0.4) type = 'sports';

        const carGroup = createCarMesh(type);

        // Spawn Logic
        // Pick a random axis
        const axis = Math.random() > 0.5 ? 'x' : 'z';
        const roads = axis === 'x' ? ROADS.z : ROADS.x; // If moving on X, we pick a Z scanline

        if (!roads.length) return;
        const roadLine = roads[Math.floor(Math.random() * roads.length)]; // Coordinate of the road center

        const dirSign = Math.random() > 0.5 ? 1 : -1;
        const laneOffset = 3 * dirSign;

        const car = {
            mesh: carGroup,
            speed: 10 + Math.random() * 10,
            dir: axis === 'x' ? new THREE.Vector3(dirSign, 0, 0) : new THREE.Vector3(0, 0, dirSign),
            axis: axis,
            targetLane: axis === 'x' ? roadLine + (dirSign > 0 ? 3 : -3) : roadLine - (dirSign > 0 ? 3 : -3),
        };

        // Initial Position
        if (axis === 'x') {
            car.mesh.position.set((Math.random() - 0.5) * CITY_SIZE, 0.4, car.targetLane);
            car.mesh.rotation.y = dirSign > 0 ? 0 : Math.PI;
        } else {
            // axis Z
            car.targetLane = roadLine + (dirSign > 0 ? -3 : 3);
            car.mesh.position.set(car.targetLane, 0.4, (Math.random() - 0.5) * CITY_SIZE);
            car.mesh.rotation.y = dirSign > 0 ? Math.PI / 2 : -Math.PI / 2;
        }

        scene.add(car.mesh);
        cars.push(car);
    }
}

function createCarMesh(type) {
    const group = new THREE.Group();

    let color = 0xff0000;
    if (type === 'sedan') color = Math.random() * 0xffffff;
    if (type === 'truck') color = 0x555555;
    if (type === 'sports') color = 0xffff00; // Yellow sports cars

    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.6 });
    let body;

    if (type === 'truck') {
        body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 5), mat);
        body.position.y = 0.75;
    } else if (type === 'sports') {
        body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), mat);
        body.position.y = 0.3;
    } else {
        // Sedan
        const bodyGeo = new THREE.BoxGeometry(2, 0.8, 4);
        body = new THREE.Mesh(bodyGeo, mat);
        body.position.y = 0.4;

        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2), mat);
        roof.position.y = 1.1;
        roof.position.z = -0.5;
        group.add(roof);
    }
    group.add(body);

    // Lights
    const headLightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const tailLightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);

    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffffaa, emissiveIntensity: 2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });

    // Assuming +Z is Front
    const hl1 = new THREE.Mesh(headLightGeo, headMat);
    hl1.position.set(-0.6, 0.5, 2.0);
    group.add(hl1);

    const hl2 = new THREE.Mesh(headLightGeo, headMat);
    hl2.position.set(0.6, 0.5, 2.0);
    group.add(hl2);

    const tl1 = new THREE.Mesh(tailLightGeo, tailMat);
    tl1.position.set(-0.6, 0.6, -2.0); // Back
    group.add(tl1);

    const tl2 = new THREE.Mesh(tailLightGeo, tailMat);
    tl2.position.set(0.6, 0.6, -2.0);
    group.add(tl2);

    return group;
}

function updateCars(delta) {
    const half = CITY_SIZE / 2;

    cars.forEach(car => {
        car.mesh.position.addScaledVector(car.dir, car.speed * delta);

        // Wrap Logic
        if (Math.abs(car.mesh.position.x) > half + 10) car.mesh.position.x = -Math.sign(car.mesh.position.x) * half;
        if (Math.abs(car.mesh.position.z) > half + 10) car.mesh.position.z = -Math.sign(car.mesh.position.z) * half;

        // Intersection Logic
        const myCo = car.axis === 'x' ? car.mesh.position.x : car.mesh.position.z;
        const perpRoads = car.axis === 'x' ? ROADS.x : ROADS.z;

        // Find closest intersection
        for (const roadVal of perpRoads) {
            if (Math.abs(myCo - roadVal) < 1.0) {
                if (Math.random() < 0.05) {
                    turnCar(car, roadVal);
                }
            }
        }
    });
}

function turnCar(car, intersectVal) {
    const turnRight = Math.random() > 0.5;
    const oldAxis = car.axis;

    if (oldAxis === 'x') {
        let dz = 0;
        if (car.dir.x > 0) dz = turnRight ? 1 : -1;
        else dz = turnRight ? -1 : 1;

        car.dir.set(0, 0, dz);
        car.axis = 'z';

        // Snap X to appropriate lane
        const newLaneX = intersectVal + (dz > 0 ? -3 : 3);
        car.mesh.position.x = newLaneX;
        car.mesh.rotation.y = dz > 0 ? Math.PI / 2 : -Math.PI / 2;

    } else {
        let dx = 0;
        if (car.dir.z > 0) dx = turnRight ? -1 : 1;
        else dx = turnRight ? 1 : -1;

        car.dir.set(dx, 0, 0);
        car.axis = 'x';

        // Snap Z to appropriate lane
        const newLaneZ = intersectVal + (dx > 0 ? 3 : -3);
        car.mesh.position.z = newLaneZ;
        car.mesh.rotation.y = dx > 0 ? 0 : Math.PI;
    }
}

// Teammate Mesh Helper
function createTeammateMesh(name) {
    const group = new THREE.Group();
    // Hologram material
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.3), mat);
    body.position.y = 0.9;
    group.add(body);

    // Label could go here

    scene.add(group);
    return group;
}

function setupSocket(token) {
    socket = io({
        auth: {
            token: token
        }
    });

    // GAME STATE Handlers
    socket.on('gameState', (serverQuestions) => {
        flags.forEach(f => scene.remove(f.mesh));
        flags.clear();
        serverQuestions.forEach(q => {
            // Only create if NOT solved (server should filter, but we double check)
            if (!q.isSolved) createFlag(q);
        });
    });

    socket.on('syncSolved', (solvedIds) => {
        if (solvedIds && solvedIds.forEach) {
            solvedIds.forEach(id => {
                if (flags.has(id)) {
                    const f = flags.get(id);
                    scene.remove(f.mesh);
                    flags.delete(id);
                }
            });
        }
    });

    socket.on('questionSolved', (data) => {
        // data: { questionId, teamName, solverName }
        if (flags.has(data.questionId)) {
            const f = flags.get(data.questionId);
            gsap.to(f.mesh.scale, {
                x: 0, y: 0, z: 0, duration: 0.5, onComplete: () => {
                    scene.remove(f.mesh);
                    flags.delete(data.questionId);
                }
            });
        }
        // Beep or notification?
    });

    socket.on('answerResult', (result) => {
        if (result.correct) {
            const modalContent = document.querySelector('.modal-content');
            gsap.to(modalContent, {
                scale: 1.2, duration: 0.1, yoyo: true, repeat: 1, onComplete: () => {
                    closeModal();
                }
            });
        } else {
            const modalContent = document.querySelector('.modal-content');
            gsap.fromTo(modalContent, { x: -10 }, { x: 10, duration: 0.05, repeat: 5, yoyo: true, clearProps: "x" });
            document.getElementById('q-feedback').innerText = "ACCESS DENIED";
            setTimeout(() => document.getElementById('q-feedback').innerText = "", 2000);
        }
    });

    // START Auth Handlers
    socket.on('teamJoined', (data) => {
        // data: { code, teamName, isLeader }
        isAuthenticated = true;

        // Hide Login, Show HUD
        loginScreen.classList.add('hidden');
        gameHud.classList.remove('hidden');

        document.getElementById('hud-team-name').innerText = `TEAM: ${data.teamName.toUpperCase()}`;
        document.getElementById('hud-team-code').innerText = `CODE: ${data.code}`;

        // Request Game State
        socket.emit('requestGameState');

        // Auto-lock pointer to start
        // user must click to lock usually, but we can try or wait for click
    });

    socket.on('leaderboardUpdate', (rankings) => {
        // rankings: [{name, score}, ...]
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';
        rankings.forEach(r => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${r.name}</span> <span style="color:var(--neon-cyan)">${r.score}</span>`;
            list.appendChild(li);
        });

        // Also update my team score if possible (need to know my team name or receive it separately)
        // For simplicity, we just rely on leaderboard for now, or finding ourselves in it.
        // Or we could store our team name locally.
        const myTeamName = document.getElementById('hud-team-name').innerText.split(': ')[1];
        if (myTeamName) {
            const myTeam = rankings.find(r => r.name.toUpperCase() === myTeamName);
            if (myTeam) scoreEl.innerText = myTeam.score;
        }
    });

    socket.on('error', (err) => {
        errorMsg.innerText = err.message;
    });
}


function createFlag(q) {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffaa00, emissiveIntensity: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(q.position.x, q.position.y + 1.5, q.position.z);
    mesh.castShadow = true;
    scene.add(mesh);
    flags.set(q.id, { mesh: mesh, data: q });
}

function updateScore() {
    // Score is now handled by leaderboard updates
}



function setupUI() {
    // Auth Flow
    // Toggle Register
    btnShowRegister.addEventListener('click', () => {
        registerFields.classList.remove('hidden');
        btnRegisterSubmit.classList.remove('hidden');
        btnAuthBack.classList.remove('hidden');
        btnLogin.classList.add('hidden');
        btnShowRegister.classList.add('hidden');
    });

    btnAuthBack.addEventListener('click', () => {
        registerFields.classList.add('hidden');
        btnRegisterSubmit.classList.add('hidden');
        btnAuthBack.classList.add('hidden');
        btnLogin.classList.remove('hidden');
        btnShowRegister.classList.remove('hidden');
        errorMsg.innerText = "";
    });

    // Login
    btnLogin.addEventListener('click', async () => {
        const email = inputEmail.value;
        const pass = inputPass.value;
        if (!email || !pass) {
            errorMsg.innerText = "MISSING CREDENTIALS";
            return;
        }
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // onAuthStateChanged will handle the rest
        } catch (e) {
            errorMsg.innerText = e.message;
        }
    });

    // Register
    btnRegisterSubmit.addEventListener('click', async () => {
        const email = inputEmail.value;
        const pass = inputPass.value;
        const roll = inputRoll.value;
        const name = inputName.value;

        if (!email || !pass || !roll || !name) {
            errorMsg.innerText = "FILL ALL FIELDS";
            return;
        }

        try {
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(cred.user, { displayName: name });

            // Store Roll Number in Firestore
            await setDoc(doc(db, "users", cred.user.uid), {
                email: email,
                displayName: name,
                rollNumber: roll,
                uid: cred.user.uid
            });

            // onAuthStateChanged will handle the rest
        } catch (e) {
            errorMsg.innerText = e.message;
        }
    });

    // Logout
    btnLogout.addEventListener('click', () => {
        signOut(auth);
        location.reload();
    });


    btnCreate.addEventListener('click', () => {
        stepTeam.classList.add('hidden');
        stepCreate.classList.remove('hidden');
    });

    btnJoin.addEventListener('click', () => {
        stepTeam.classList.add('hidden');
        stepJoin.classList.remove('hidden');
    });

    btnSubmitCreate.addEventListener('click', () => {
        if (inputTeamName.value.length < 3) {
            errorMsg.innerText = "TEAM NAME TOO SHORT";
            return;
        }
        // Use user.displayName
        socket.emit('createTeam', { playerName: currentUser.displayName, teamName: inputTeamName.value });
    });

    btnSubmitJoin.addEventListener('click', () => {
        if (inputTeamCode.value.length !== 6) {
            errorMsg.innerText = "INVALID CODE LENGTH";
            return;
        }
        socket.emit('joinTeam', { playerName: currentUser.displayName, teamCode: inputTeamCode.value.toUpperCase() });
    });

    document.querySelectorAll('.step-back').forEach(btn => {
        btn.addEventListener('click', () => {
            stepCreate.classList.add('hidden');
            stepJoin.classList.add('hidden');
            stepTeam.classList.remove('hidden');
            errorMsg.innerText = "";
        });
    });

    // Forgot Password
    document.getElementById('btn-forgot-pass').addEventListener('click', async () => {
        const email = inputEmail.value;
        if (!email) {
            errorMsg.innerText = "ENTER EMAIL FIRST";
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email);
            errorMsg.innerText = "RESET LINK SENT";
            errorMsg.style.color = "#00ff00";
        } catch (e) {
            errorMsg.innerText = "FAILED TO SEND";
            console.error(e);
        }
    });

    // Game UI
    qSubmit.addEventListener('click', submitAnswer);
    qCancel.addEventListener('click', closeModal);
}


// Global Auth State Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log("Logged in:", user.email);
        const token = await user.getIdToken();

        // Connect Socket
        if (!socket) {
            setupSocket(token);
        }

        // Hide Auth Container, Show Team Choice
        document.getElementById('auth-container').classList.add('hidden');
        stepTeam.classList.remove('hidden');

    } else {
        currentUser = null;
        // Show Auth Container
        const authCont = document.getElementById('auth-container');
        if (authCont) authCont.classList.remove('hidden');

        stepAuth.classList.remove('hidden');
        stepTeam.classList.add('hidden');
        gameHud.classList.add('hidden');
        loginScreen.classList.remove('hidden');
    }
});
// Start Game
init();
animate();
