export async function isMediaPipeAvailable(): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 3000);
      const check = setInterval(() => {
        // @ts-ignore - MediaPipe properties are set dynamically on window
        if (window.FaceMesh && window.Camera) {
          clearTimeout(timeout);
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    return true;
  } catch {
    return false;
  }
}
