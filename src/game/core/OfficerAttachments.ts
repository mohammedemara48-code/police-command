import * as THREE from 'three';

/** The MakeHuman rig's +Y runs wrist-to-fingers; +Z points out of the palm.
 * Keep the weapon grip at the palm, with its +Z barrel along the fingers.
 * Recheck the holder because dressing is asynchronous and the user can swap bodies.
 */
export function bindOfficerWeapon(player: THREE.Object3D, gun: THREE.Object3D): boolean {
  const holder = player.children.find((c) => c.userData.model);
  const hand = holder?.getObjectByName('hand_r');
  if (!hand) {
    if (gun.parent !== player) player.add(gun);
    gun.scale.setScalar(1);
    return false;
  }
  if (gun.parent !== hand) {
    hand.add(gun);
    gun.position.set(0, 0.065, 0);
    gun.rotation.set(-Math.PI / 2, 0, Math.PI);
    // The procedural weapon is authored in metres, while the rig is fitted to height.
    const scale = hand.getWorldScale(new THREE.Vector3());
    gun.scale.copy(player.getWorldScale(new THREE.Vector3())).divide(scale);
  }
  return true;
}
