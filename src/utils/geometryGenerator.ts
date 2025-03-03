import * as THREE from 'three';


export const createCube = (): THREE.Object3D => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ color: 0x70f39e });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.y = .5;
    return cube;
}

export const createPlane = (): THREE.Object3D => {
    const planeGeometry = new THREE.PlaneGeometry(5, 5);
    planeGeometry.rotateX(-Math.PI / 2);
    const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xa492f7 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    return plane;
}

export const createBatchedMesh = (): THREE.Object3D => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const sphere = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x70f39e });

    // initialize and add geometries into the batched mesh
    const batchedMesh = new THREE.BatchedMesh(10, 5000, 10000, material);
    const boxId = batchedMesh.addGeometry(box);
    const sphereId = batchedMesh.addGeometry(sphere);

    batchedMesh.addInstance(boxId);
    batchedMesh.addInstance(sphereId);
    const boxMatrix = new THREE.Matrix4();
    const sphereMatrix = new THREE.Matrix4();
    boxMatrix.setPosition(new THREE.Vector3(2, 0.5 ,2));
    sphereMatrix.setPosition(new THREE.Vector3(-2, 0.5, -2));
    // position the geometries
    batchedMesh.setMatrixAt(boxId, boxMatrix);
    batchedMesh.setMatrixAt(sphereId, sphereMatrix);

    return batchedMesh;
}