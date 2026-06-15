declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
  }
}

declare module '@mediapipe/face_mesh' {}
declare module '@mediapipe/camera_utils' {}
export {};
