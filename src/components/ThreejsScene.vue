<template>
    <div class="h-screen w-screen">
        <div ref='threejsMap' />
    </div>
</template>
<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, ref, watch } from 'vue';
import { Tween, Group, Easing } from '@tweenjs/tween.js';
import { createBatchedMesh, createCube, createPlane } from '../utils/geometryGenerator.ts'
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const props = defineProps({
    cubeJump: {
        type: Boolean,
        default: false
    }
})
const tweenGroup = new Group();
// Create a scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xff8de1);
// Add a directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
directionalLight.position.set(-2, 5, 4);
scene.add(directionalLight);

// Add an ambient light
const ambientLight = new THREE.AmbientLight(0x404040, 10); // Soft white light
scene.add(ambientLight);

const cube = createCube();
scene.add(cube);
const plane = createPlane();
scene.add(plane);
const batchedMesh = createBatchedMesh();
scene.add(batchedMesh);


// Create a camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Create a renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping

// Enable shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;

cube.castShadow = true;
plane.receiveShadow = true;
batchedMesh.castShadow = true;

// Create controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Add TransformControls
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.attach(cube); // Attach to the cube initially
const gizmo = transformControls.getHelper();
scene.add(gizmo);

// Handle interaction between orbit controls and transform controls
transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value; // Disable orbit controls when transforming
});

// Optional: Add key controls to switch transform modes
window.addEventListener('keydown', (event) => {
    switch (event.key) {
        case 'g': // translate
            transformControls.setMode('translate');
            break;
        case 'r': // rotate
            transformControls.setMode('rotate');
            break;
        case 's': // scale
            transformControls.setMode('scale');
            break;
    }
});

const threejsMap = ref<Node>()

const domElement = renderer.domElement;

onMounted(() => {

    threejsMap.value?.appendChild(domElement);

    window.addEventListener("resize", setSize);
    setSize();
    animate();
})

const setSize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
};

// Render the scene
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
    tweenGroup.update();
}

watch(() => props.cubeJump, (newVal) => {
    if (newVal) {
        // Create new tweens each time with current position values
        const startY = cube.position.y;
        const jumpHeight = 2;
        
        const jumpTween = new Tween({ y: startY })
            .to({ y: startY + jumpHeight }, 500)
            .easing(Easing.Quartic.Out)
            .onUpdate((object) => {
                cube.position.y = object.y;
            })
            .onComplete(() => {
                // Create fall tween when jump completes
                const fallTween = new Tween({ y: startY + jumpHeight })
                    .to({ y: startY }, 1000)
                    .easing(Easing.Bounce.Out)
                    .onUpdate((object) => {
                        cube.position.y = object.y;
                    });
                
                tweenGroup.add(fallTween);
                fallTween.start();
            });
        
        tweenGroup.add(jumpTween);
        jumpTween.start();
    }
})

</script>
<style scoped></style>