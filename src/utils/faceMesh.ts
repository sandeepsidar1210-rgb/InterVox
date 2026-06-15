let faceMeshInstance: any = null;

export async function getFaceMesh(onResults: (results: any) => void): Promise<any> {
  if (faceMeshInstance) {
    faceMeshInstance.onResults(onResults);
    return faceMeshInstance;
  }

  // @ts-ignore - FaceMesh is loaded from CDN
  const faceMesh = new window.FaceMesh({
    locateFile: (file: string) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onResults);
  await faceMesh.initialize();
  faceMeshInstance = faceMesh;
  return faceMesh;
}

export function disposeFaceMesh() {
  if (faceMeshInstance) {
    faceMeshInstance.close();
    faceMeshInstance = null;
  }
}
