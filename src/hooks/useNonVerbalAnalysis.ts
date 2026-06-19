import { useRef, useState, useCallback, useEffect } from "react";
import { getFaceMesh, disposeFaceMesh } from "../utils/faceMesh";

export interface NonVerbalSummary {
  eyeContactPercent: number;
  dominantExpression: string;
  averageHeadPose: string;
  confidenceScore: number;
  presenceScore: number;
  eyeContactTimeline: boolean[];
  blinkRate: number;
}

export interface NonVerbalMetrics {
  eyeContactScore: number; // 0-100, rolling average
  isLookingAtScreen: boolean; // current frame
  headPose: "forward" | "down" | "left" | "right" | "up";
  expressionState: "neutral" | "stressed" | "confident" | "uncertain";
  blinkRate: number; // blinks per minute
  framesSampled: number;
  _lastEAR?: number;
  eyeContactTimeline: boolean[];
  sessionSummary: NonVerbalSummary;
}

const defaultSummary: NonVerbalSummary = {
  eyeContactPercent: 0,
  dominantExpression: "neutral",
  averageHeadPose: "forward",
  confidenceScore: 0,
  presenceScore: 0,
  eyeContactTimeline: [],
  blinkRate: 0,
};

const defaultMetrics: NonVerbalMetrics = {
  eyeContactScore: 0,
  isLookingAtScreen: true,
  headPose: "forward",
  expressionState: "neutral",
  blinkRate: 0,
  framesSampled: 0,
  _lastEAR: 0.25,
  eyeContactTimeline: [],
  sessionSummary: defaultSummary,
};

// Landmarks Key Indices
const UPPER_LIP = 13;
const LOWER_LIP = 14;
const LEFT_MOUTH = 61;
const RIGHT_MOUTH = 291;

const LEFT_BROW_INNER = 107;
const RIGHT_BROW_INNER = 336;
const LEFT_EYE_TOP = 159;
const RIGHT_EYE_TOP = 386;

const LEFT_EYE_TOP_LID = 159;
const LEFT_EYE_BOT_LID = 145;
const LEFT_EYE_LEFT = 33;
const LEFT_EYE_RIGHT = 133;

function computeEyeContact(landmarks: any[]): boolean {
  if (!landmarks || landmarks.length <= 473) return false;
  // Get iris center positions
  const leftIrisCenter = {
    x: landmarks[468].x,
    y: landmarks[468].y,
  };
  const rightIrisCenter = {
    x: landmarks[473].x,
    y: landmarks[473].y,
  };

  // Get eye corner bounds
  const leftEyeWidth = Math.abs(landmarks[133].x - landmarks[33].x);
  const rightEyeWidth = Math.abs(landmarks[362].x - landmarks[263].x);

  if (leftEyeWidth === 0 || rightEyeWidth === 0) return false;

  // Iris position ratio within eye (0 = far left, 1 = far right, 0.5 = center)
  const leftRatio = (leftIrisCenter.x - landmarks[33].x) / leftEyeWidth;
  const rightRatio = (rightIrisCenter.x - landmarks[263].x) / rightEyeWidth;

  // If iris is centered (0.35-0.65 range) -> looking at screen
  const leftCentered = leftRatio > 0.35 && leftRatio < 0.65;
  const rightCentered = rightRatio > 0.35 && rightRatio < 0.65;

  return leftCentered && rightCentered;
}

function computeHeadPose(landmarks: any[]): NonVerbalMetrics["headPose"] {
  if (!landmarks || landmarks.length <= 454) return "forward";
  const nose = landmarks[1];
  const chin = landmarks[152];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  // Vertical tilt: if chin.y - nose.y is small -> head down
  const verticalTilt = chin.y - nose.y;
  if (verticalTilt < 0.08) return "down";
  if (verticalTilt > 0.18) return "up";

  // Horizontal turn: compare cheek distances to nose
  const leftDist = Math.abs(nose.x - leftCheek.x);
  const rightDist = Math.abs(rightCheek.x - nose.x);
  const totalCheekDist = leftDist + rightDist;
  if (totalCheekDist === 0) return "forward";

  const turnRatio = leftDist / totalCheekDist;
  if (turnRatio < 0.35) return "left";
  if (turnRatio > 0.65) return "right";

  return "forward";
}

function computeExpression(landmarks: any[]): NonVerbalMetrics["expressionState"] {
  if (!landmarks || landmarks.length <= 386) return "neutral";
  // Mouth openness ratio
  const mouthHeight = Math.abs(landmarks[LOWER_LIP].y - landmarks[UPPER_LIP].y);
  const mouthWidth = Math.abs(landmarks[RIGHT_MOUTH].x - landmarks[LEFT_MOUTH].x);
  if (mouthWidth === 0) return "neutral";
  const mouthRatio = mouthHeight / mouthWidth;

  // Eyebrow raise (distance from brow to eye top)
  const leftBrowRaise = Math.abs(landmarks[LEFT_BROW_INNER].y - landmarks[LEFT_EYE_TOP].y);
  const rightBrowRaise = Math.abs(landmarks[RIGHT_BROW_INNER].y - landmarks[RIGHT_EYE_TOP].y);
  const avgBrowRaise = (leftBrowRaise + rightBrowRaise) / 2;

  if (mouthRatio > 0.35 && avgBrowRaise > 0.04) return "uncertain"; // open mouth + raised brows
  if (avgBrowRaise < 0.02) return "stressed"; // furrowed brows
  if (mouthRatio < 0.05 && avgBrowRaise > 0.03) return "confident"; // closed mouth, relaxed brows
  return "neutral";
}

function computeEAR(landmarks: any[]): number {
  if (!landmarks || landmarks.length <= 145) return 0.25;
  const vertical = Math.abs(landmarks[LEFT_EYE_TOP_LID].y - landmarks[LEFT_EYE_BOT_LID].y);
  const horizontal = Math.abs(landmarks[LEFT_EYE_RIGHT].x - landmarks[LEFT_EYE_LEFT].x);
  if (horizontal === 0) return 0.25;
  return vertical / horizontal;
}

export function useNonVerbalAnalysis(
  videoRef: React.RefObject<HTMLVideoElement>,
  isActive: boolean
): {
  metrics: NonVerbalMetrics;
  startAnalysis: (stream: MediaStream) => Promise<void>;
  stopAnalysis: () => NonVerbalSummary;
} {
  const [displayMetrics, setDisplayMetrics] = useState<NonVerbalMetrics>(defaultMetrics);

  const metricsRef = useRef<NonVerbalMetrics>({ ...defaultMetrics });
  const frameCountRef = useRef(0);
  const eyeContactFramesRef = useRef(0);
  const blinkHistoryRef = useRef<number[]>([]);
  const expressionHistoryRef = useRef<string[]>([]);
  const eyeContactTimelineRef = useRef<boolean[]>([]);
  const cameraRef = useRef<any>(null);

  const computeSessionSummary = useCallback((): NonVerbalSummary => {
    const eyeContactPercent = frameCountRef.current > 0
      ? Math.round((eyeContactFramesRef.current / frameCountRef.current) * 100)
      : 0;

    const expressionCounts = expressionHistoryRef.current.reduce((acc, e) => {
      acc[e] = (acc[e] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dominantExpression = Object.entries(expressionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";

    const expressionScores: Record<string, number> = {
      confident: 100,
      neutral: 70,
      uncertain: 40,
      stressed: 20,
    };
    
    const confidenceScore = Math.round(
      eyeContactPercent * 0.5 +
      (expressionScores[dominantExpression] ?? 50) * 0.3 +
      70 * 0.2 // placeholder for head pose forward %
    );

    const presenceScore = Math.round((eyeContactPercent + confidenceScore) / 2);

    return {
      eyeContactPercent,
      dominantExpression,
      averageHeadPose: "forward",
      confidenceScore,
      presenceScore,
      eyeContactTimeline: [...eyeContactTimelineRef.current],
      blinkRate: blinkHistoryRef.current.length,
    };
  }, []);

  const onResults = useCallback((results: any) => {
    if (!results.multiFaceLandmarks?.length) {
      // update state to indicate face not detected or just skip to prevent crashes
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    frameCountRef.current++;

    const isLooking = computeEyeContact(landmarks);
    const headPose = computeHeadPose(landmarks);
    const expression = computeExpression(landmarks);
    const ear = computeEAR(landmarks);

    if (isLooking) eyeContactFramesRef.current++;
    expressionHistoryRef.current.push(expression);

    // Detect blink
    const prevEAR = metricsRef.current._lastEAR ?? 0.25;
    if (prevEAR > 0.15 && ear < 0.15) {
      blinkHistoryRef.current.push(Date.now());
      // keep only last 60s of blinks
      const cutoff = Date.now() - 60000;
      blinkHistoryRef.current = blinkHistoryRef.current.filter((t) => t > cutoff);
    }

    // Capture timeline segment every second (approx 30 frames)
    if (frameCountRef.current % 30 === 0) {
      eyeContactTimelineRef.current.push(isLooking);
      if (eyeContactTimelineRef.current.length > 3600) {
        eyeContactTimelineRef.current.shift(); // Cap at 1 hour (3600 entries)
      }
    }

    // Update rolling metrics in Ref (no React re-render)
    metricsRef.current = {
      eyeContactScore: Math.round((eyeContactFramesRef.current / frameCountRef.current) * 100),
      isLookingAtScreen: isLooking,
      headPose,
      expressionState: expression,
      blinkRate: blinkHistoryRef.current.length,
      framesSampled: frameCountRef.current,
      _lastEAR: ear,
      eyeContactTimeline: eyeContactTimelineRef.current,
      sessionSummary: defaultSummary, // placeholder, computed on stop or update
    };

    // React state update every 30 frames (≈1s at 30fps) to avoid visual jank
    if (frameCountRef.current % 30 === 0) {
      const summary = computeSessionSummary();
      metricsRef.current.sessionSummary = summary;
      setDisplayMetrics({ ...metricsRef.current });
    }
  }, [computeSessionSummary]);

  const startAnalysis = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current) return;
    try {
      // Reset variables
      frameCountRef.current = 0;
      eyeContactFramesRef.current = 0;
      blinkHistoryRef.current = [];
      expressionHistoryRef.current = [];
      eyeContactTimelineRef.current = [];
      metricsRef.current = { ...defaultMetrics };

      const faceMesh = await getFaceMesh(onResults);
      
      // Bind stream to video element
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (playErr) {
        console.warn("video.play() failed or was interrupted:", playErr);
      }

      let active = true;
      const processFrame = async () => {
        if (!active) return;
        if (videoRef.current && videoRef.current.readyState >= 2) { // HAVE_CURRENT_DATA
          try {
            await faceMesh.send({ image: videoRef.current });
          } catch (err) {
            console.warn("FaceMesh send error:", err);
          }
        }
        requestAnimationFrame(processFrame);
      };

      // Mock a control interface that behaves like MediaPipe Camera class
      cameraRef.current = {
        stop: () => {
          active = false;
        }
      };

      requestAnimationFrame(processFrame);
    } catch (err) {
      console.error("Failed to start MediaPipe camera/FaceMesh:", err);
    }
  }, [videoRef, onResults]);

  const stopAnalysis = useCallback((): NonVerbalSummary => {
    try {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      disposeFaceMesh();
    } catch (err) {
      console.warn("Error stopping camera analysis:", err);
    }
    return computeSessionSummary();
  }, [computeSessionSummary]);

  // Cleanup on unmount or when active flag goes to false
  useEffect(() => {
    if (!isActive) {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      disposeFaceMesh();
    }
  }, [isActive]);

  return {
    metrics: displayMetrics,
    startAnalysis,
    stopAnalysis,
  };
}
