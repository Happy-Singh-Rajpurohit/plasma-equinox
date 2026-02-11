import * as THREE from 'three';
// import { io } from "socket.io-client";

// Global GSAP is available via script tag, but also accessible if imported. 
// We'll use the global 'gsap' for simplicity since we added the script tag.

// --- constants ---
const PLAYER_SPEED = 15.0;
const CITY_SIZE = 220;
const BLOCK_SIZE = 20;

// --- globals ---
let camera, scene, renderer;
let socket;
let raycaster;
const cars = []; // Moving cars

// Inputs
const keyState = {};
let mouseX = 0;
let mouseY = 0;

// Game Objects
const flags = new Map();
const npcMeshes = [];
const collidables = [];

// Player
let player;
let cameraTarget;

// UI Elements
const instructions = document.getElementById('instructions');
const modal = document.getElementById('question-modal');
const qText = document.getElementById('q-text');
const qInput = document.getElementById('q-answer');
const qSubmit = document.getElementById('q-submit');
const qCancel = document.getElementById('q-cancel');
const scoreEl = document.getElementById('flags-count');
let solvedCount = 0;
let isGameActive = false;
let interactableFlag = null;

init();
animate();

function init() {
    console.log("Init called");
    // 1. Setup Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.005);

    // 2. Setup Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // 3. Setup Lights (Night Mode)
    const hemiLight = new THREE.HemisphereLight(0x050510, 0x111122, 0.8); // Brighter night ambient
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xaaccff, 0.8); // Brighter Moon
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    // ... (shadow map settings unchanged) ...

    // ... (in createPlayer) ...
    // Flashlight / Spotlight
    const spotLight = new THREE.SpotLight(0xffffff, 2); // Stronger Flashlight
    spotLight.position.set(0, 2, 0);
    spotLight.target.position.set(0, 0, 10); // Look further
    spotLight.angle = Math.PI / 4; // Wider beam
    spotLight.penumbra = 0.3;
    spotLight.distance = 40; // Limit distance
    spotLight.castShadow = true;
    group.add(spotLight);
    group.add(spotLight.target);
}
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
const d = 150;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', onWindowResize);

// 10. Socket
setupSocket();

// 11. UI
setupUI();

// 12. Cars
initCars(50);
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
        walkTime: 0
    };

    // Camera Target
    cameraTarget = new THREE.Object3D();
    cameraTarget.position.set(0, 2.5, 0);
    group.add(cameraTarget);

    // Flashlight / Spotlight
    const spotLight = new THREE.SpotLight(0xffffff, 2); // Stronger Flashlight
    spotLight.position.set(0, 2, 0);
    spotLight.target.position.set(0, 0, 10); // Look further
    spotLight.angle = Math.PI / 4; // Wider beam
    spotLight.penumbra = 0.3;
    spotLight.distance = 60; // Limit distance
    spotLight.castShadow = true;
    group.add(spotLight);
    group.add(spotLight.target);
}

function setupInput() {
    console.log("setupInput called");
    document.addEventListener('keydown', (e) => {
        keyState[e.code] = true;
        if (e.code === 'KeyE') tryInteract();
    });
    document.addEventListener('keyup', (e) => keyState[e.code] = false);

    document.body.addEventListener('mousemove', (e) => {
        if (!isGameActive) return;
        const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
        const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

        mouseX -= movementX * 0.002;
        mouseY -= movementY * 0.002;

        // Clamp Pitch
        mouseY = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, mouseY));
    });

    instructions.addEventListener('click', () => {
        document.body.requestPointerLock();
        isGameActive = true;
        instructions.style.display = 'none';
        modal.classList.add('hidden');
    });

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== document.body) {
            isGameActive = false;
            if (modal.classList.contains('hidden')) {
                instructions.style.display = 'flex';
            }
        }
    });

    // Start with default view
    mouseX = Math.PI; // Face forward
    mouseY = 0.2;
}

function generateCity() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(CITY_SIZE + 200, CITY_SIZE + 200);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x335533 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const buildingColors = [0xeeeeee, 0xdddddd, 0xcccccc, 0xbbbbbb, 0x8899aa];

    const halfCity = CITY_SIZE / 2;
    const unitSize = BLOCK_SIZE + 10; // Road width included
    const UNIT_SIZE = unitSize;

    // Road Base
    const roadBase = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY_SIZE, CITY_SIZE).rotateX(-Math.PI / 2),
        roadMat
    );
    roadBase.position.y = 0.05;
    roadBase.receiveShadow = true;
    scene.add(roadBase);

    for (let x = -halfCity + 5; x < halfCity; x += unitSize) {
        for (let z = -halfCity + 5; z < halfCity; z += unitSize) {

            // Streetlights at intersections
            createStreetLight(x - 5, z - 5);

            // Force center intersection to be empty (Spawn Point)
            if (Math.abs(x + BLOCK_SIZE / 2) < UNIT_SIZE && Math.abs(z + BLOCK_SIZE / 2) < UNIT_SIZE) {
                continue;
            }
            // Safely spawn away from 0,0
            if (Math.abs(x) < 20 && Math.abs(z) < 20) continue;

            if (Math.random() < 0.2) {
                createPark(x + BLOCK_SIZE / 2, z + BLOCK_SIZE / 2, BLOCK_SIZE);
            } else {
                createBuildingBlock(x + BLOCK_SIZE / 2, z + BLOCK_SIZE / 2, BLOCK_SIZE, sidewalkMat, buildingColors);
            }
        }
    }
}

function createStreetLight(x, z) {
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 6),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    pole.position.set(x, 3, z);
    scene.add(pole);

    // const bulb = new THREE.PointLight(0xffaa00, 5, 20);
    // bulb.position.set(x, 6, z);
    // scene.add(bulb);

    // Bulb mesh
    const bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    bulbMesh.position.set(x, 6, z);
    scene.add(bulbMesh);
}

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

function createBuildingBlock(x, z, size, swMat, colors) {
    // Sidewalk
    const sw = new THREE.Mesh(new THREE.BoxGeometry(size, 0.2, size), swMat);
    sw.position.set(x, 0.1, z);
    sw.receiveShadow = true;
    scene.add(sw);

    const margin = 2;
    const bSize = size - margin;

    const typeRoll = Math.random();
    let height, bMat, buildingGeo;

    // Building Types
    if (typeRoll < 0.1) {
        // Restaurant
        height = 6;
        bMat = new THREE.MeshStandardMaterial({ color: 0xffaa55, roughness: 0.5 }); // Orange/Warm
        buildingGeo = new THREE.BoxGeometry(bSize, height, bSize);
    } else if (typeRoll < 0.2) {
        // Hospital
        height = 12;
        bMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
        // Add Red Cross Texture
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(28, 10, 8, 44);
        ctx.fillRect(10, 28, 44, 8);
        const tex = new THREE.CanvasTexture(canvas);
        bMat.map = tex;
        buildingGeo = new THREE.BoxGeometry(bSize, height, bSize);
    } else if (typeRoll < 0.3) {
        // College (Brick)
        height = 15;
        bMat = new THREE.MeshStandardMaterial({ color: 0x884444, roughness: 0.8 });
        buildingGeo = new THREE.BoxGeometry(bSize, height, bSize);
    } else {
        // Skyscraper (Default)
        height = 15 + Math.random() * 40;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const texture = createBuildingTexture();
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, height / 10);
        bMat = new THREE.MeshStandardMaterial({ color: color, map: texture, roughness: 0.1 });
        buildingGeo = new THREE.BoxGeometry(bSize, height, bSize);
    }

    const building = new THREE.Mesh(buildingGeo, bMat);
    building.position.set(x, height / 2 + 0.2, z);
    building.castShadow = true;
    building.receiveShadow = true;

    scene.add(building);
    collidables.push(new THREE.Box3().setFromObject(building));
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

// Duplicate initNPCs removed

function setupSocket() {
    socket = io();
    socket.on('gameState', (serverQuestions) => {
        flags.forEach(f => scene.remove(f.mesh));
        flags.clear();
        solvedCount = 0;
        serverQuestions.forEach(q => {
            if (!q.isSolved) createFlag(q);
            else solvedCount++;
        });
        updateScore();
    });
    socket.on('questionSolved', (data) => {
        if (flags.has(data.questionId)) {
            const f = flags.get(data.questionId);

            // GSAP removal animation
            gsap.to(f.mesh.scale, {
                x: 0, y: 0, z: 0, duration: 0.5, onComplete: () => {
                    scene.remove(f.mesh);
                    flags.delete(data.questionId);
                }
            });

            solvedCount++;
            updateScore();
        }
    });
    socket.on('answerResult', (result) => {
        if (result.correct) {
            // Success animation on UI
            const modalContent = document.querySelector('.modal-content');
            gsap.to(modalContent, {
                scale: 1.2, duration: 0.1, yoyo: true, repeat: 1, onComplete: () => {
                    closeModal();
                }
            });
        } else {
            // Shake animation
            const modalContent = document.querySelector('.modal-content');
            gsap.fromTo(modalContent, { x: -10 }, { x: 10, duration: 0.05, repeat: 5, yoyo: true, clearProps: "x" });
        }
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
    scoreEl.innerText = solvedCount;
    // Pop animation
    gsap.fromTo(scoreEl, { scale: 1.5 }, { scale: 1, duration: 0.3 });
}

function tryInteract() {
    if (!isGameActive) return;
    if (interactableFlag) {
        openModal(interactableFlag.data);
    }
}

function openModal(data) {
    document.exitPointerLock();
    isGameActive = false;
    modal.classList.remove('hidden');
    qText.innerText = data.question;
    qInput.value = '';

    // GSAP Open
    gsap.fromTo(modal, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3 });

    modal.dataset.qid = data.id;
    setTimeout(() => qInput.focus(), 100);
}

function closeModal() {

    // GSAP Close
    gsap.to(modal, {
        opacity: 0, scale: 0.8, duration: 0.2, onComplete: () => {
            modal.classList.add('hidden');
            document.body.requestPointerLock();
            isGameActive = true;
        }
    });
}

function setupUI() {
    qSubmit.addEventListener('click', () => {
        const id = parseInt(modal.dataset.qid);
        socket.emit('attemptAnswer', { questionId: id, answer: qInput.value });
    });
    qCancel.addEventListener('click', closeModal);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function checkCollision(position) {
    // Create a bounding box for the player at the new position
    const playerBox = new THREE.Box3();
    const size = 0.5; // Rough player size
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
    const moveDir = new THREE.Vector3(0, 0, 0);

    // Forward is relative to camera horizontal direction
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

    if (moveDir.lengthSq() > 0) {
        moveDir.normalize();

        // Rotate player to face move direction
        const targetRot = Math.atan2(moveDir.x, moveDir.z);
        // Smooth rotation
        let rotDiff = targetRot - player.mesh.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        player.mesh.rotation.y += rotDiff * 10 * delta;

        // Run Speed Multiplier
        let speedMultiplier = 1.0;
        if (keyState['ShiftLeft'] || keyState['ShiftRight']) {
            speedMultiplier = 2.0;
        }

        // Move
        const visualSpeed = PLAYER_SPEED * speedMultiplier;
        const potentialPos = player.mesh.position.clone().addScaledVector(moveDir, visualSpeed * delta);

        // Simple bounds
        const margin = CITY_SIZE / 2;
        potentialPos.x = Math.max(-margin, Math.min(margin, potentialPos.x));
        potentialPos.z = Math.max(-margin, Math.min(margin, potentialPos.z));

        // Check Collision
        if (!checkCollision(potentialPos)) {
            player.mesh.position.x = potentialPos.x;
            player.mesh.position.z = potentialPos.z;

            // Walking Animation
            player.walkTime += delta * 10 * speedMultiplier;
            const swing = Math.sin(player.walkTime) * 0.4;

            player.parts.leftLeg.rotation.x = swing;
            player.parts.rightLeg.rotation.x = -swing;
            player.parts.leftArm.rotation.x = -swing;
            player.parts.rightArm.rotation.x = swing;
        } else {
            // Optional: Slide along walls (simplified)
            // Try X only
            const tryX = player.mesh.position.clone();
            tryX.x = potentialPos.x;
            if (!checkCollision(tryX)) player.mesh.position.x = tryX.x;

            // Try Z only
            const tryZ = player.mesh.position.clone();
            tryZ.z = potentialPos.z;
            if (!checkCollision(tryZ)) player.mesh.position.z = tryZ.z;
        }
    } else {
        // Reset animation
        player.parts.leftLeg.rotation.x = 0;
        player.parts.rightLeg.rotation.x = 0;
        player.parts.leftArm.rotation.x = 0;
        player.parts.rightArm.rotation.x = 0;
    }

    // Jump / Vertical Physics
    if (player.onGround && keyState['Space']) {
        player.velocity.y = 15.0; // Jump force
        player.onGround = false;
    }

    // Apply Gravity
    player.velocity.y -= 40.0 * delta; // Gravity
    player.mesh.position.y += player.velocity.y * delta;

    // Ground Collision
    if (player.mesh.position.y < 0) {
        player.mesh.position.y = 0;
        player.velocity.y = 0;
        player.onGround = true;
    }
}

function updateCamera() {
    // Camera orbital position calculated from mouseX/mouseY around player
    const dist = 8;
    const height = 4;

    const cx = player.mesh.position.x + dist * Math.sin(mouseX) * Math.cos(mouseY);
    const cz = player.mesh.position.z + dist * Math.cos(mouseX) * Math.cos(mouseY);
    const cy = player.mesh.position.y + height + dist * Math.sin(mouseY);

    // Smooth camera follow? For now direct set
    camera.position.set(cx, cy, cz);
    camera.lookAt(player.mesh.position.x, player.mesh.position.y + 2, player.mesh.position.z);
}

function animate() {
    requestAnimationFrame(animate);
    // console.log("Animating...");
    const time = performance.now();
    const delta = Math.min((time - (init.lastTime || time)) / 1000, 0.1);
    init.lastTime = time;

    if (isGameActive) {
        updatePlayer(delta);
    }
    updateCamera();
    updateCars(delta);

    // NPCs
    npcMeshes.forEach(n => {
        n.mesh.position.addScaledVector(n.dir, 3 * delta);
        const margin = CITY_SIZE / 2;
        if (Math.abs(n.mesh.position.x) > margin || Math.abs(n.mesh.position.z) > margin) {
            n.dir.negate();
        }
    });

    // Flags
    flags.forEach(f => {
        f.mesh.rotation.y += delta;
        f.mesh.position.y += Math.sin(time * 0.005) * 0.01;
    });

    // Raycast Interaction
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    raycaster.set(camera.position, camDir);

    // Check flags
    const trash = [];
    // We only raycast against flag meshes
    const flagMeshes = Array.from(flags.values()).map(wrapper => wrapper.mesh);
    const intersects = raycaster.intersectObjects(flagMeshes);

    if (intersects.length > 0 && intersects[0].distance < 15) {
        const hit = intersects[0].object;
        // Find wrapper
        for (let [id, val] of flags) {
            if (val.mesh === hit) {
                interactableFlag = val;
                val.mesh.material.emissive.set(0xffffff);
            }
        }
    } else {
        if (interactableFlag) interactableFlag.mesh.material.emissive.set(0xffaa00);
        interactableFlag = null;
    }

    renderer.render(scene, camera);
}

// --- Car Logic ---

function initCars(count) {
    for (let i = 0; i < count; i++) {
        // Car Type
        const typeRoll = Math.random();
        let type = 'sedan';
        if (typeRoll < 0.2) type = 'truck';
        else if (typeRoll < 0.4) type = 'sports';

        const mesh = createCarMesh(type);

        // Random Position on Road
        // We know roads are at grid intervals.
        // x or z axis aligned.
        const isXAxis = Math.random() > 0.5;
        const laneOffset = 3; // Right side of road

        // Snap to road grid
        const unitSize = BLOCK_SIZE + 10;
        const gridIndex = Math.floor((Math.random() - 0.5) * (CITY_SIZE / unitSize)) * unitSize;

        if (isXAxis) {
            mesh.position.set((Math.random() - 0.5) * CITY_SIZE, 0.5, gridIndex + laneOffset);
            mesh.rotation.y = Math.PI / 2; // Face X
        } else {
            mesh.position.set(gridIndex - laneOffset, 0.5, (Math.random() - 0.5) * CITY_SIZE);
            mesh.rotation.y = Math.PI; // Face Z (Backwards?) 
        }

        mesh.castShadow = true;
        scene.add(mesh);

        const speed = 10 + Math.random() * 15;
        const dir = new THREE.Vector3();
        if (isXAxis) dir.set(1, 0, 0);
        else dir.set(0, 0, 1);

        // Randomize direction (fwd/back)
        if (Math.random() > 0.5) {
            dir.negate();
            if (isXAxis) mesh.rotation.y = -Math.PI / 2;
            else mesh.rotation.y = 0;

            // Adjust lane for opposite traffic
            if (isXAxis) mesh.position.z -= laneOffset * 2;
            else mesh.position.x += laneOffset * 2;
        }

        cars.push({
            mesh: mesh,
            dir: dir,
            speed: type === 'sports' ? speed * 1.5 : (type === 'truck' ? speed * 0.7 : speed)
        });
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
        roof.position.set(0, 1.1, -0.5); // Local to group? No, roof invalid parent logic if relative to body. 
        // Better:
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

        // Wrap around
        if (Math.abs(car.mesh.position.x) > half) {
            car.mesh.position.x = -Math.sign(car.mesh.position.x) * half;
        }
        if (Math.abs(car.mesh.position.z) > half) {
            car.mesh.position.z = -Math.sign(car.mesh.position.z) * half;
        }
    });
}

// --- Restored Utilities ---

function setupSocket() {
    socket = io();
    socket.on('connect', () => {
        console.log('Connected to server');
    });
}

function setupUI() {
    qSubmit.addEventListener('click', () => {
        const answer = qInput.value.trim().toLowerCase();
        if (interactableFlag && answer === interactableFlag.answer.toLowerCase()) {
            solvedCount++;
            scoreEl.innerText = solvedCount;

            // Success
            scene.remove(interactableFlag.mesh);
            flags.delete(interactableFlag.id);

            modal.classList.add('hidden');
            instructions.style.display = 'none';
            isGameActive = true;
            document.body.requestPointerLock();
        } else {
            alert("Incorrect Answer!");
        }
    });

    qCancel.addEventListener('click', () => {
        modal.classList.add('hidden');
        instructions.style.display = 'none';
        isGameActive = true;
        document.body.requestPointerLock();
    });
}

function tryInteract() {
    if (!interactableFlag) return;

    // Check distance again just in case
    if (player.mesh.position.distanceTo(interactableFlag.mesh.position) < 5) {
        isGameActive = false;
        document.exitPointerLock();

        modal.classList.remove('hidden');
        qText.innerText = interactableFlag.question;
        qInput.value = '';
        qInput.focus();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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
