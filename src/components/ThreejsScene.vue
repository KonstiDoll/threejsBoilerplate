<template>
    <div class="h-screen w-screen">
        <div ref='threejsMap'>

        </div>
    </div>
</template>
<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onMounted, ref, watch } from 'vue';
import * as TWEEN from '@tweenjs/tween.js'

const props = defineProps({
    cubeJump: {
        type: Boolean,
        default: false
    }
})

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

// Create a cube
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x70f39e });
const cube = new THREE.Mesh(geometry, material);
cube.position.y = .5;
scene.add(cube);

//Create a plane
const planeGeometry = new THREE.PlaneGeometry(5, 5, 5);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xa492f7 });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
scene.add(plane);

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


// Create controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

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
    TWEEN.update();
}

watch(() => props.cubeJump, (newVal) => {
    if (newVal) {
        new TWEEN.Tween({ y: cube.position.y })
            .to({ y: 2 }, 500)
            .easing(TWEEN.Easing.Quartic.Out)
            .onUpdate((object) => {
                cube.position.y = object.y;
            })
            .onComplete(() => {
                new TWEEN.Tween({ y: cube.position.y })
                    .to({ y: 0.5 }, 1000)
                    .easing(TWEEN.Easing.Bounce.Out)
                    .onUpdate((object) => {
                        cube.position.y = object.y;
                    })
                    .start();
            })
            .start();
    }
})

</script>
<style scoped></style>