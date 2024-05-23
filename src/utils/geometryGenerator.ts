import * as THREE from 'three';


export const createCube = (): THREE.Object3D => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ color: 0x70f39e });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = .5;
    return cube;
}

export const createPlane = (): THREE.Object3D => {
    const planeGeometry = new THREE.PlaneGeometry(5, 5, 5);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xa492f7 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    return plane;
}