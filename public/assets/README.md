# الأصول البصرية (Assets)

الوضع الحالي: مجسمات Three.js إجرائية (procedural meshes) مع خامات PBR بسيطة.

## إضافة خامات (Textures)
1. ضع صور JPG/PNG في `assets/images/` مثل `asphalt.jpg`, `glass_facade.jpg`.
2. في الكود:
```js
const loader = new THREE.TextureLoader();
const road = loader.load('/assets/images/asphalt.jpg');
road.wrapS = road.wrapT = THREE.RepeatWrapping;
material.map = road;
```

## إضافة موديلات GLTF / GLB
1. ضع الملفات في `assets/models/` مثل `police_car.glb`.
2. التحميل:
```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
loader.load('/assets/models/police_car.glb', (gltf) => scene.add(gltf.scene));
```

مصادر مقترحة مفتوحة: Poly Pizza, Kenney.nl, Quaternius, AmbientCG (textures).
