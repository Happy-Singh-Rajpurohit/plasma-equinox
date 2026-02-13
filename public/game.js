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
const turrets = []; // New
let player;
let playerHP = 100; // New
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
            updateTurrets(time); // New
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

    // Gun (Rifle)
    const rifle = new THREE.Group();
    rifle.position.set(0, -0.2, 0.4);

    // Body relative to arm
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    rifle.add(rBody);
    // Barrel
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    rBarrel.rotation.x = Math.PI / 2;
    rBarrel.position.set(0, 0.05, 0.5);
    rifle.add(rBarrel);
    // Mag
    const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x050505 }));
    rMag.position.set(0, -0.15, 0.1);
    rifle.add(rMag);
    // Scope
    const rScope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x66ccff }));
    rScope.rotation.x = Math.PI / 2;
    rScope.position.set(0, 0.12, 0.1);
    rifle.add(rScope);

    rightArm.add(rifle);
    // player.gun = rifle; // MOVED: player is not defined yet

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
        gun: rifle, // Assigned here
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

    // Shooting Listener
    document.addEventListener('mousedown', (e) => {
        if (isGameActive && isAuthenticated && e.button === 0) {
            shoot();
        }
    });
}

function shoot() {
    if (!player) return;

    // Raycast from Camera (Crosshair Center)
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Visual Tracer
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const points = [];

    // Start tracer from Gun Barrel
    const gunWorldPos = new THREE.Vector3();
    if (player.gun) {
        player.gun.getWorldPosition(gunWorldPos);
        gunWorldPos.add(new THREE.Vector3(0, 0.1, 0.5).applyQuaternion(player.gun.getWorldQuaternion(new THREE.Quaternion()))); // Tip of barrel approx
    } else {
        gunWorldPos.copy(player.mesh.position).add(new THREE.Vector3(0, 1.5, 0));
    }

    // Check hits
    const intersects = raycaster.intersectObjects(scene.children, true);
    let target = camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(100));

    let hitObject = null;

    // Filter self and find first hit
    for (const hit of intersects) {
        // Simple check: ignore player parts
        if (hit.object.isPlayerPart || hit.distance < 2) continue; // Distance check helps ignore near-clipping player mesh

        target = hit.point;
        hitObject = hit.object;
        break;
    }

    points.push(gunWorldPos);
    points.push(target);

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, tracerMat);
    scene.add(line);

    // Fade out tracer
    setTimeout(() => scene.remove(line), 50);

    // Damage Logic
    if (hitObject) {
        // Check if it's a turret
        // Traverse up to find group or userData
        let obj = hitObject;
        while (obj) {
            if (obj.userData && obj.userData.type === 'turret') {
                obj.userData.hp -= 5; // Rifle does less damage per shot but faster fire? Kept at 5 for now.

                // Flash Red
                if (obj.material && obj.material.color) { // Check if mat exists
                    const oldColor = obj.material.color.getHex();
                    obj.material.color.setHex(0xffaaaa);
                    setTimeout(() => {
                        if (obj && obj.material) obj.material.color.setHex(oldColor);
                    }, 50);
                }

                if (obj.userData.hp <= 0) {
                    destroyTurret(obj);
                }
                break;
            }
            obj = obj.parent;
        }
    }
}

function updateCamera() {
    if (!player) return;

    // Over-the-shoulder offsets
    const offsetH = 4; // Distance behind
    const offsetV = 2.5; // Height
    const offsetSide = 1.5; // Right side

    // Calculate camera position based on mouseX/Y
    // mouseX controls Yaw (Player & Camera)
    // mouseY controls Pitch (Camera only)

    // Camera Rotation
    const camRotX = mouseY;
    const camRotY = mouseX;

    // Position relative to player
    const cp = player.mesh.position;

    // Calculate offset vector based on Yaw
    const sideVec = new THREE.Vector3(Math.cos(camRotY), 0, -Math.sin(camRotY)).multiplyScalar(offsetSide);
    const backVec = new THREE.Vector3(Math.sin(camRotY), 0, Math.cos(camRotY)).multiplyScalar(offsetH);

    const cx = cp.x + backVec.x + sideVec.x;
    const cz = cp.z + backVec.z + sideVec.z;
    const cy = cp.y + offsetV + (Math.sin(camRotX) * offsetH);

    camera.position.set(cx, cy, cz);

    // Look Point (Forward from player + pitch)
    const lookTarget = cp.clone().add(new THREE.Vector3(
        -Math.sin(camRotY) * 20,
        -Math.sin(camRotX) * 20 + 2, // Pitch look
        -Math.cos(camRotY) * 20
    ));
    camera.lookAt(lookTarget);

    // Sync Player Rotation to Camera Yaw immediately (TPS Lock)
    player.mesh.rotation.y = camRotY + Math.PI; // +PI to face away from camera
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

        // Smother Rotation
        player.mesh.rotation.y += rotDiff * 5 * delta;

        // Tilt into turn (Bank)
        const tilt = THREE.MathUtils.clamp(rotDiff, -0.5, 0.5);
        player.mesh.rotation.z = THREE.MathUtils.lerp(player.mesh.rotation.z, -tilt * 0.5, delta * 5);

        // Run Tilt (Forward)
        const runTilt = (keyState['ShiftLeft'] || keyState['ShiftRight']) ? 0.2 : 0;
        player.mesh.rotation.x = THREE.MathUtils.lerp(player.mesh.rotation.x, runTilt, delta * 5);

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

        // Reset Body Tilt
        player.mesh.rotation.z = THREE.MathUtils.lerp(player.mesh.rotation.z, 0, delta * 5);
        player.mesh.rotation.x = THREE.MathUtils.lerp(player.mesh.rotation.x, 0, delta * 5);
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

// ... City Generation ...

function generateCity() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(CITY_SIZE + 400, CITY_SIZE + 400);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x050510 }); // Dark background
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.position.y = -0.1;
    scene.add(ground);

    // Realistic Road Material (Asphalt with Noise)
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 512; roadCanvas.height = 512;
    const ctx = roadCanvas.getContext('2d');

    // Base Asphalt
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 512, 512);

    // Noise
    for (let i = 0; i < 5000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#2a2a2a' : '#1a1a1a';
        const s = Math.random() * 2 + 1;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }

    // Grunge / Cracks (Simple lines)
    ctx.strokeStyle = '#181818';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * 512, Math.random() * 512);
        ctx.lineTo(Math.random() * 512, Math.random() * 512);
        ctx.stroke();
    }

    const roadTex = new THREE.CanvasTexture(roadCanvas);
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(CITY_SIZE / 10, CITY_SIZE / 10);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.9 });

    // Sidewalk / Curb Material
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });

    const halfCity = CITY_SIZE / 2;

    // Base Road Layer
    const roadBase = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE).rotateX(-Math.PI / 2),
        roadMat
    );
    roadBase.position.y = 0.02;
    roadBase.receiveShadow = true;
    scene.add(roadBase);

    // Geometry Reuse
    const curbGeoH = new THREE.BoxGeometry(BLOCK_SIZE, 0.15, 0.5); // Along X
    const curbGeoV = new THREE.BoxGeometry(0.5, 0.15, BLOCK_SIZE); // Along Z

    // Grid Generation
    for (let x = -halfCity; x < halfCity; x += UNIT_SIZE) {
        ROADS.x.push(x - ROAD_WIDTH / 2); // Center of vertical road

        for (let z = -halfCity; z < halfCity; z += UNIT_SIZE) {
            if (x === -halfCity) ROADS.z.push(z - ROAD_WIDTH / 2); // Center of horizontal road

            // Block Center
            const bx = x + BLOCK_SIZE / 2;
            const bz = z + BLOCK_SIZE / 2;

            // Streetlights
            if (Math.random() > 0.6) createStreetLight(x - 5, z - 5);

            // Add Curbs around the block
            // North
            const cN = new THREE.Mesh(curbGeoH, sidewalkMat);
            cN.position.set(bx, 0.075, z + BLOCK_SIZE);
            scene.add(cN);
            // South
            const cS = new THREE.Mesh(curbGeoH, sidewalkMat);
            cS.position.set(bx, 0.075, z);
            scene.add(cS);
            // East
            const cE = new THREE.Mesh(curbGeoV, sidewalkMat);
            cE.position.set(x + BLOCK_SIZE, 0.075, bz);
            scene.add(cE);
            // West
            const cW = new THREE.Mesh(curbGeoV, sidewalkMat);
            cW.position.set(x, 0.075, bz);
            scene.add(cW);

            // ZONES
            const distFromCenter = Math.sqrt(bx * bx + bz * bz);

            // 1. Park
            if (Math.abs(bx) < 40 && Math.abs(bz) < 40) {
                if (Math.abs(bx) > 10 || Math.abs(bz) > 10) { // Keep 0,0 clear for spawn
                    createPark(bx, bz, BLOCK_SIZE);
                }
                continue;
            }

            // 2. Downtown
            if (distFromCenter < 100 && (Math.abs(bx) < 40 || Math.abs(bz) < 40)) {
                createSkyscraper(bx, bz, BLOCK_SIZE);
                continue;
            }

            // 3. Industrial
            if (bx > 50) {
                createWarehouse(bx, bz, BLOCK_SIZE);
                continue;
            }

            // 4. Residential
            createResidential(bx, bz, BLOCK_SIZE);
        }
    }

    // Road Markings
    addRoadMarkings(halfCity);

    // Spawn Enemies
    spawnTurrets(15);
}

function addRoadMarkings(halfCity) {
    const dashedGeo = new THREE.PlaneGeometry(0.5, 4).rotateX(-Math.PI / 2);
    const dashedMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const crosswalkGeo = new THREE.PlaneGeometry(2, 6).rotateX(-Math.PI / 2);
    const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Markings Loop
    ROADS.x.forEach(rx => {
        // Vertical Dashed Lines
        for (let z = -halfCity; z < halfCity; z += 12) {
            const line = new THREE.Mesh(dashedGeo, dashedMat);
            line.position.set(rx, 0.03, z);
            scene.add(line);
        }

        // Intersections with ROADS.z
        ROADS.z.forEach(rz => {
            // Crosswalks around intersection (rx, rz)
            // 4 positions: rx +/- offset, rz +/- offset
            // Just simple white blocks for now
            const cw1 = new THREE.Mesh(crosswalkGeo, crosswalkMat);
            cw1.position.set(rx - 6, 0.03, rz); // Left
            scene.add(cw1);

            const cw2 = new THREE.Mesh(crosswalkGeo, crosswalkMat);
            cw2.position.set(rx + 6, 0.03, rz); // Right
            scene.add(cw2);

            const cw3 = new THREE.Mesh(crosswalkGeo, crosswalkMat);
            cw3.rotation.y = Math.PI / 2;
            cw3.position.set(rx, 0.03, rz - 6); // Top
            scene.add(cw3);

            const cw4 = new THREE.Mesh(crosswalkGeo, crosswalkMat);
            cw4.rotation.y = Math.PI / 2;
            cw4.position.set(rx, 0.03, rz + 6); // Bottom
            scene.add(cw4);
        });
    });

    // Horizontal Dashed Lines
    const dashH = dashedGeo.clone();
    dashH.rotateY(Math.PI / 2);
    ROADS.z.forEach(rz => {
        for (let x = -halfCity; x < halfCity; x += 12) {
            const line = new THREE.Mesh(dashH, dashedMat);
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

    const light = new THREE.PointLight(0xffaa00, 1, 15);
    light.position.set(x, 7.0, z);
    scene.add(light);
}

function createBuildingTexture(colorHue) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Wall Color
    ctx.fillStyle = `hsl(${colorHue}, 20%, 30%)`;
    ctx.fillRect(0, 0, 128, 256);

    // Windows
    const winW = 14;
    const winH = 20;
    const gapX = 10;
    const gapY = 15;

    ctx.fillStyle = '#111'; // Window Frame/Depth

    for (let y = 10; y < 240; y += (winH + gapY)) {
        for (let x = 10; x < 110; x += (winW + gapX)) {
            // Frame
            ctx.fillStyle = '#050510';
            ctx.fillRect(x - 1, y - 1, winW + 2, winH + 2);

            // Glass
            if (Math.random() > 0.7) {
                // Lit
                ctx.fillStyle = `hsl(${40 + Math.random() * 10}, 80%, 60%)`;
            } else {
                // Dark Reflection
                ctx.fillStyle = `hsl(${210}, 30%, ${10 + Math.random() * 10}%)`;
            }
            ctx.fillRect(x, y, winW, winH);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; // Pixelated/Sharp look
    return tex;
}

function createSkyscraper(x, z, size) {
    const height = 40 + Math.random() * 60;
    const geo = new THREE.BoxGeometry(size - 2, height, size - 2);

    const tex = createBuildingTexture(200 + Math.random() * 40); // Blueish
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, height / 40);

    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.2, metalness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    collidables.push(new THREE.Box3().setFromObject(mesh));
}

function createWarehouse(x, z, size) {
    const height = 10 + Math.random() * 5;
    const geo = new THREE.BoxGeometry(size - 1, height, size - 1);
    const tex = createBuildingTexture(0); // Red/Brownish logic could be added, passing Hue
    // Override texture for warehouse to be more brick-like? Keep simple for now
    const mat = new THREE.MeshStandardMaterial({ color: 0x887766, roughness: 0.9 });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    collidables.push(new THREE.Box3().setFromObject(mesh));
}

function createResidential(x, z, size) {
    const height = 8 + Math.random() * 12;
    const geo = new THREE.BoxGeometry(size - 4, height, size - 4);

    const hue = Math.random() * 360;
    const tex = createBuildingTexture(hue);
    tex.repeat.set(1, height / 30);

    const mat = new THREE.MeshStandardMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    collidables.push(new THREE.Box3().setFromObject(mesh));
}

function createTree(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    // Trunk
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 1.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x553311 })
    );
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage levels
    const gGreen = new THREE.MeshStandardMaterial({ color: 0x228833, flatShading: true });

    const l1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2, 8), gGreen);
    l1.position.y = 2.0;
    l1.castShadow = true;
    group.add(l1);

    const l2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.8, 8), gGreen);
    l2.position.y = 3.0;
    l2.castShadow = true;
    group.add(l2);

    const l3 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 8), gGreen);
    l3.position.y = 4.0;
    l3.castShadow = true;
    group.add(l3);

    scene.add(group);
    collidables.push(new THREE.Box3().setFromObject(trunk)); // Collide with trunk
}

function createPark(x, z, size) {
    // Grass Base
    const geo = new THREE.BoxGeometry(size, 0.2, size);
    const mat = new THREE.MeshStandardMaterial({ color: 0x33aa44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.1, z);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Add Trees
    for (let i = 0; i < 5; i++) {
        const tx = x + (Math.random() - 0.5) * (size - 2);
        const tz = z + (Math.random() - 0.5) * (size - 2);
        createTree(tx, tz);
    }
}

function spawnTurrets(count) {
    const geo = new THREE.SphereGeometry(0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000 });
    const baseGeo = new THREE.CylinderGeometry(0.4, 0.6, 1);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * CITY_SIZE;
        const z = (Math.random() - 0.5) * CITY_SIZE;

        // Avoid spawn center
        if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;

        const group = new THREE.Group();
        group.position.set(x, 0.5, z);

        const base = new THREE.Mesh(baseGeo, baseMat);
        group.add(base);

        const head = new THREE.Mesh(geo, mat.clone());
        head.position.y = 0.8;
        head.userData = { type: 'turret', hp: 20 }; // Hp logic
        group.add(head);

        scene.add(group);

        turrets.push({
            group: group,
            head: head,
            lastFire: 0,
            active: true
        });

        // Add to collidables? Maybe base
        collidables.push(new THREE.Box3().setFromObject(base));
    }
}

function updateTurrets(time) {
    if (!player) return;
    const pPos = player.mesh.position;

    turrets.forEach(t => {
        if (!t.active) return;
        if (!t.group) return;

        const dist = t.group.position.distanceTo(pPos);
        if (dist < 60) { // Increased Range
            // Rotate ENTIRE enemy to face player
            t.group.lookAt(pPos.x, t.group.position.y, pPos.z);
            // We only rotate Y mostly, but lookAt handles it. 
            // For full body rotation towards player on ground plane:
            // t.group.lookAt(pPos.x, t.group.position.y, pPos.z);

            // Fire
            if (time - t.lastFire > 1500) { // Faster fire rate
                // Get Gun World Position
                const gunWorldPos = new THREE.Vector3();
                if (t.gun) {
                    t.gun.getWorldPosition(gunWorldPos);
                } else {
                    // Fallback for old turrets or errors
                    gunWorldPos.copy(t.group.position).add(new THREE.Vector3(0, 1.5, 0));
                }

                // LOS Check from Gun
                if (checkTurretLOS(gunWorldPos, pPos)) {
                    t.lastFire = time;
                    fireTurretProjectile(gunWorldPos, pPos);
                }
            }
        }
    });
}

function checkTurretLOS(start, targetPos) {
    const targetCenter = targetPos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const dir = new THREE.Vector3().subVectors(targetCenter, start).normalize();
    const ray = new THREE.Raycaster(start, dir, 0, 45);

    const intersects = ray.intersectObjects(scene.children, true);

    for (const hit of intersects) {
        if (hit.distance < 1) continue;

        let isTurret = false;
        let p = hit.object;
        while (p) {
            if (p.userData && p.userData.type === 'turret') { isTurret = true; break; }
            p = p.parent;
        }
        if (isTurret) continue;

        let isPlayer = false;
        p = hit.object;
        while (p) {
            if (p === player.mesh) { isPlayer = true; break; }
            p = p.parent;
        }

        if (isPlayer) return true;
        return false;
    }
    return false;
}

function fireTurretProjectile(start, target) {
    const geo = new THREE.SphereGeometry(0.2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start);
    scene.add(mesh);

    // Direction
    const dir = new THREE.Vector3().subVectors(target, start).normalize();

    // Animate Projectile
    const speed = 15;
    const startTime = performance.now();

    function animateProjectile() {
        const now = performance.now();
        const dt = (now - startTime) / 1000;

        mesh.position.addScaledVector(dir, speed * 0.016); // Approx delta

        // Check Collision with Player
        if (player && mesh.position.distanceTo(player.mesh.position) < 1.0) {
            damagePlayer(15); // Turret Damage
            scene.remove(mesh);
            return;
        }

        // Remove after 3s
        if (dt > 3) {
            scene.remove(mesh);
            return;
        }

        if (scene.children.includes(mesh)) requestAnimationFrame(animateProjectile);
    }
    animateProjectile();
}

function damagePlayer(amount) {
    if (!isGameActive) return; // Invincible when modal is open (game inactive)

    playerHP -= amount;
    // Update UI
    const bar = document.getElementById('health-bar');
    const text = document.getElementById('health-text');
    if (bar) bar.style.width = `${Math.max(0, playerHP)}%`;
    if (text) text.innerText = `${Math.max(0, playerHP)} / 100`;

    if (playerHP <= 0) {
        // Respawn
        playerHP = 100;

        // Random Respawn
        const range = CITY_SIZE / 2 - 20;
        const sx = (Math.random() - 0.5) * range;
        const sz = (Math.random() - 0.5) * range;
        player.mesh.position.set(sx, 0.5, sz);

        if (bar) bar.style.width = '100%';
        if (text) text.innerText = '100 / 100';

        alert("YOU DIED! -5 Points. Respawning...");

        // Emit Death
        if (socket) socket.emit('playerDeath');
    }
}

function destroyTurret(mesh) {
    // mesh is the head, group, or a child part

    const turret = turrets.find(t => t.group === mesh || t.group.children.includes(mesh) || t.head === mesh || t.gun === mesh);

    if (turret && turret.active) {
        turret.active = false;

        // Remove from array
        const idx = turrets.indexOf(turret);
        if (idx > -1) turrets.splice(idx, 1);

        // Scoring
        if (socket) socket.emit('enemyKill');

        // Explosion Effect (Simple)
        gsap.to(turret.group.scale, {
            x: 0, y: 0, z: 0, duration: 0.5, onComplete: () => {
                scene.remove(turret.group);
            }
        });
    }
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
            if (result.newScore !== undefined) {
                scoreEl.innerText = result.newScore;
            }
        } else {
            const modalContent = document.querySelector('.modal-content');
            gsap.fromTo(modalContent, { x: -10 }, { x: 10, duration: 0.05, repeat: 5, yoyo: true, clearProps: "x" });
            document.getElementById('q-feedback').innerText = result.message || "ACCESS DENIED";
            setTimeout(() => document.getElementById('q-feedback').innerText = "", 2000);
        }
    });

    // START Auth Handlers
    socket.on('teamJoined', (data) => {
        // data: { code, teamName, isLeader, score }
        console.log("Team Joined Data:", data);
        isAuthenticated = true;

        // Hide Login, Show HUD
        loginScreen.classList.add('hidden');
        gameHud.classList.remove('hidden');

        document.getElementById('hud-team-name').innerText = `TEAM: ${data.teamName.toUpperCase()}`;
        document.getElementById('hud-team-code').innerText = `CODE: ${data.code}`;
        scoreEl.innerText = data.score || 0; // Update local score immediately

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

    socket.on('scoreUpdate', (data) => {
        if (data.score !== undefined) {
            scoreEl.innerText = data.score;
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
