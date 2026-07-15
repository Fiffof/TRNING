import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { RefreshCw, Check, TriangleAlert, ArrowLeftRight, X, Calendar, ChevronLeft } from "lucide-react";

const C = {
  bg: "#0E1116", surface: "#161B22", surface2: "#1C232C", border: "#28313C",
  text: "#E8EDF2", muted: "#8A95A3", dim: "#7E8896", warn: "#F87171", accent: "#34D5C9",
};

/* ================================================================
   Trning — greedy vector engine, specific-exercise dataset.
   Each row is ONE loggable exercise (a specific implement + variation),
   so a logged weight maps to one lift over time. { required, oneOf }
   equipment: required = all needed, oneOf = at least one — used only
   where implements are truly interchangeable and logged identically
   (goblet squat DB/KB, a carry with either).
   14 muscles · 8 joints · 13 movement patterns (science4sport + GPP).
   Edit zones: A = demand/weights, B = the exercise database.
   ================================================================ */

const Muscle = {
  Quads: 0, Hamstrings: 1, Glutes: 2, Chest: 3, UpperBack: 4, FrontDelts: 5,
  SideDelts: 6, RearDelts: 7, Biceps: 8, Triceps: 9, Abs: 10, Obliques: 11,
  SpinalErectors: 12, Calves: 13,
};
const MUSCLE_COUNT = 14;
const MUSCLE_LABELS = ["Quads", "Hamstrings", "Glutes", "Chest", "Upper back", "Front delts",
  "Side delts", "Rear delts", "Biceps", "Triceps", "Abs", "Obliques", "Spinal erectors", "Calves"];

const Joint = { Ankle: 0, Knee: 1, Hip: 2, Lumbar: 3, Thoracic: 4, Shoulder: 5, Elbow: 6, Wrist: 7 };
const JOINT_COUNT = 8;
const JOINT_LABELS = ["Ankle", "Knee", "Hip", "Lower back", "Mid back", "Shoulder", "Elbow", "Wrist"];

const MP = {
  HipHinge: 0, HipDominant: 1, KneeDominant: 2, HorizontalPush: 3, VerticalPush: 4,
  HorizontalPull: 5, VerticalPull: 6, Rotational: 7, AntiRotation: 8, AntiFlexion: 9,
  AntiExtension: 10, AntiLateralFlexion: 11, GPP: 12,
};
const MOVEMENT_COUNT = 13;
const MAIN_PATTERNS = [MP.HipHinge, MP.HipDominant, MP.KneeDominant, MP.HorizontalPush, MP.VerticalPush, MP.HorizontalPull, MP.VerticalPull];

/* ---- EDIT ZONE A · demand + weights ------------------------------- */
const DEFAULT_MEV = [
  10, // Quads
  8,  // Hamstrings
  8,  // Glutes
  8,  // Chest
  12, // UpperBack
  4,  // FrontDelts
  4,  // SideDelts
  4,  // RearDelts
  8,  // Biceps
  8,  // Triceps
  10, // Abs
  8,  // Obliques
  8,  // SpinalErectors
  12, // Calves
];
const PER_EXERCISE_CREDIT = 5; // ≈ mean muscle credit per exercise (retuned to this dataset below)
const MEV_SHAPE_TOTAL = DEFAULT_MEV.reduce((s, v) => s + v, 0);
function mevForWorkout(size) {
  const target = PER_EXERCISE_CREDIT * size;
  return DEFAULT_MEV.map((v) => (v * target) / MEV_SHAPE_TOTAL);
}
const BASE_CONFIG = {
  jointWeight: 2, muscleWeight: 0, movementWeight: 1.5, fatigueWeight: 0.4,
  workoutSize: 4, mev: mevForWorkout(4), movementDemand: new Array(MOVEMENT_COUNT).fill(0), priorityMultiplier: 3,
};

/* ---- vector utilities --------------------------------------------- */
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] || 0) * (b[i] || 0); return s; };
const add = (a, b) => a.map((v, i) => v + (b[i] || 0));
const subtract = (a, b) => a.map((v, i) => v - (b[i] || 0));
const clampMin = (a, m) => a.map((v) => Math.max(m, v));
const vsum = (a) => a.reduce((s, v) => s + v, 0);
const zeros = (n) => new Array(n).fill(0);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/* ---- equipment vocabulary ----------------------------------------- */
const Equipment = {
  Dumbbell: "dumbbell", Kettlebell: "kettlebell", Barbell: "barbell", PullUpBar: "bar",
  LowBar: "lowbar", ParallelBars: "parallelbars", Bench: "bench", Box: "box", Rope: "rope",
};
const EQUIP = [
  { key: "dumbbell", label: "Dumbbells" }, { key: "kettlebell", label: "Kettlebell" }, { key: "barbell", label: "Barbell" },
  { key: "bar", label: "Pull-up bar" }, { key: "lowbar", label: "Bar / rack" }, { key: "parallelbars", label: "Parallel bars" },
  { key: "bench", label: "Bench" }, { key: "box", label: "Box / step" }, { key: "rope", label: "Jump rope" },
];
const ENVS = [{ key: "indoor", label: "Indoor" }, { key: "outdoor", label: "Outdoor" }, { key: "open", label: "Open space" }];
const IO = ["indoor", "outdoor"], ANY = ["indoor", "outdoor", "open"], OPEN = ["open"], OUT = ["outdoor", "open"];

const sparse = (n, o) => { const v = zeros(n); for (const k in o) v[+k] = o[k]; return v; };
const M = (o) => sparse(MUSCLE_COUNT, o), J = (o) => sparse(JOINT_COUNT, o), V = (o) => sparse(MOVEMENT_COUNT, o);
const { Dumbbell, Kettlebell, Barbell, PullUpBar, LowBar, ParallelBars, Bench, Box, Rope } = Equipment;

/* ---- EDIT ZONE B · THE EXERCISE DATABASE ---------------------------
   One row = one loggable exercise. equipment: { required:[all], oneOf:[≥1] };
   {} = bodyweight. Vectors are heuristic training credit (muscle 0–3,
   joint stress 0–3, movement membership 0–1). fatigue 1–9, skill 1–5. */
const EXDB = [
  // ---- Knee dominant ----
  { id: "bb-back-squat", name: "Barbell back squat", category: "Knee dominant", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 2, [Muscle.SpinalErectors]: 1 }), jointVector: J({ [Joint.Knee]: 2, [Joint.Hip]: 1.5, [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1, [MP.AntiFlexion]: 1 }), fatigue: 6, skill: 2 },
  { id: "bb-front-squat", name: "Barbell front squat", category: "Knee dominant", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 1.5, [Muscle.UpperBack]: 1, [Muscle.SpinalErectors]: 1 }), jointVector: J({ [Joint.Knee]: 2, [Joint.Hip]: 1, [Joint.Lumbar]: 1, [Joint.Wrist]: 1 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1, [MP.AntiExtension]: 1 }), fatigue: 6, skill: 3 },
  { id: "goblet-squat", name: "Goblet squat", category: "Knee dominant", equipment: { oneOf: [Dumbbell, Kettlebell] }, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 2 }), jointVector: J({ [Joint.Knee]: 2, [Joint.Hip]: 1.5 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1, [MP.AntiExtension]: 0.5 }), fatigue: 4, skill: 1 },
  { id: "db-front-squat", name: "Dumbbell front squat", category: "Knee dominant", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 1.5 }), jointVector: J({ [Joint.Knee]: 2, [Joint.Hip]: 1 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1 }), fatigue: 4, skill: 2 },
  { id: "pistol-squat", name: "Pistols", category: "Knee dominant", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 3 }), jointVector: J({ [Joint.Knee]: 1.5, [Joint.Hip]: 1.5, [Joint.Ankle]: 1 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1 }), fatigue: 4, skill: 3 },
  { id: "bulgarian-split-squat", name: "Bulgarian split-squat", category: "Knee dominant", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 2.5 }), jointVector: J({ [Joint.Knee]: 1.5, [Joint.Hip]: 1.5, [Joint.Ankle]: 0.5 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1, [MP.AntiRotation]: 0.5 }), fatigue: 5, skill: 2 },
  { id: "walking-lunges", name: "Walking lunges", category: "Knee dominant", equipment: { required: [Dumbbell] }, environment: OUT,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 2.5 }), jointVector: J({ [Joint.Knee]: 1.5, [Joint.Hip]: 1.5, [Joint.Ankle]: 0.5 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1 }), fatigue: 5, skill: 1 },
  { id: "reverse-lunges", name: "Reverse lunges", category: "Knee dominant", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 2.5, [Muscle.Glutes]: 2.5 }), jointVector: J({ [Joint.Knee]: 1, [Joint.Hip]: 1.5 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1 }), fatigue: 3, skill: 1 },
  { id: "step-ups", name: "Step-ups", category: "Knee dominant", equipment: { required: [Box] }, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 3 }), jointVector: J({ [Joint.Knee]: 1.5, [Joint.Hip]: 1.5 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1 }), fatigue: 4, skill: 1 },
  { id: "lateral-lunges", name: "Lateral lunges", category: "Knee dominant", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 3, [Muscle.Glutes]: 3 }), jointVector: J({ [Joint.Knee]: 1.5, [Joint.Hip]: 1.5, [Joint.Ankle]: 1 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1 }), fatigue: 4, skill: 1 },

  // ---- Hip dominant ----
  { id: "bb-deadlift", name: "Barbell deadlift", category: "Hip dominant", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 3, [Muscle.Glutes]: 3, [Muscle.UpperBack]: 1, [Muscle.SpinalErectors]: 2 }), jointVector: J({ [Joint.Hip]: 3, [Joint.Lumbar]: 3, [Joint.Knee]: 1 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.AntiFlexion]: 1 }), fatigue: 9, skill: 3 },
  { id: "bb-rdl", name: "Barbell RDL", category: "Hip dominant", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 3, [Muscle.Glutes]: 2, [Muscle.SpinalErectors]: 2 }), jointVector: J({ [Joint.Hip]: 2.5, [Joint.Lumbar]: 2.5 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.AntiFlexion]: 1 }), fatigue: 7, skill: 2 },
  { id: "db-rdl", name: "Dumbbell RDL", category: "Hip dominant", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 3, [Muscle.Glutes]: 2, [Muscle.SpinalErectors]: 1.5 }), jointVector: J({ [Joint.Hip]: 2, [Joint.Lumbar]: 2 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.AntiFlexion]: 1 }), fatigue: 5, skill: 2 },
  { id: "db-deadlift", name: "Dumbbell deadlift", category: "Hip dominant", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 2.5, [Muscle.Glutes]: 2.5, [Muscle.SpinalErectors]: 1.5 }), jointVector: J({ [Joint.Hip]: 2.5, [Joint.Lumbar]: 2, [Joint.Knee]: 1 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.AntiFlexion]: 1 }), fatigue: 6, skill: 2 },
  { id: "single-leg-rdl", name: "Single-leg RDL", category: "Hip dominant", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 3, [Muscle.Glutes]: 2 }), jointVector: J({ [Joint.Hip]: 2, [Joint.Lumbar]: 1.5, [Joint.Ankle]: 0.5 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.AntiRotation]: 1 }), fatigue: 4, skill: 3 },
  { id: "good-mornings", name: "Good mornings", category: "Hip dominant", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 2.5, [Muscle.Glutes]: 2, [Muscle.SpinalErectors]: 2.5 }), jointVector: J({ [Joint.Hip]: 2.5, [Joint.Lumbar]: 3 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.AntiFlexion]: 1 }), fatigue: 6, skill: 3 },
  { id: "kb-swing", name: "Kettlebell swing", category: "Hip dominant", equipment: { required: [Kettlebell] }, environment: IO,
    muscleVector: M({ [Muscle.Hamstrings]: 1.5, [Muscle.Glutes]: 1.5, [Muscle.SpinalErectors]: 1 }), jointVector: J({ [Joint.Hip]: 2, [Joint.Lumbar]: 2, [Joint.Shoulder]: 1 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.GPP]: 1, [MP.AntiFlexion]: 1 }), fatigue: 6, skill: 2 },
  { id: "Single-leg-hip-thrust", name: "Single-leg hip thrusts", category: "Hip dominant", equipment: { }, environment: IO,
    muscleVector: M({ [Muscle.Glutes]: 3, [Muscle.Hamstrings]: 1 }), jointVector: J({ [Joint.Hip]: 1, [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.HipDominant]: 1 }), fatigue: 5, skill: 1 },

  // ---- Press ----
  { id: "bb-bench-press", name: "Barbell bench press", category: "Press", equipment: { required: [Barbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 3, [Muscle.FrontDelts]: 2, [Muscle.Triceps]: 2 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5, [Joint.Wrist]: 1 }),
    movementVector: V({ [MP.HorizontalPush]: 1 }), fatigue: 6, skill: 3 },
  { id: "db-bench-press", name: "Dumbbell bench press", category: "Press", equipment: { required: [Dumbbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 3, [Muscle.FrontDelts]: 2, [Muscle.Triceps]: 2 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5, [Joint.Wrist]: 1 }),
    movementVector: V({ [MP.HorizontalPush]: 1 }), fatigue: 6, skill: 2 },
  { id: "incline-db-press", name: "Incline dumbbell press", category: "Press", equipment: { required: [Dumbbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 2.5, [Muscle.FrontDelts]: 2.5, [Muscle.Triceps]: 2 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5 }),
    movementVector: V({ [MP.HorizontalPush]: 0.6, [MP.VerticalPush]: 0.4 }), fatigue: 6, skill: 2 },
  { id: "push-ups", name: "Push-ups", category: "Press", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 3, [Muscle.FrontDelts]: 2, [Muscle.Triceps]: 2 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5, [Joint.Wrist]: 1, [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.HorizontalPush]: 1, [MP.AntiExtension]: 1 }), fatigue: 4, skill: 1 },
  { id: "feet-elevated-push-ups", name: "Feet-elevated push-ups", category: "Press", equipment: { required: [Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 3, [Muscle.FrontDelts]: 2.5, [Muscle.Triceps]: 2 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5, [Joint.Wrist]: 1 }),
    movementVector: V({ [MP.HorizontalPush]: 0.6, [MP.VerticalPush]: 0.4, [MP.AntiExtension]: 1 }), fatigue: 5, skill: 2 },
  { id: "diamond-push-ups", name: "Diamond push-ups", category: "Press", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 2.5, [Muscle.Triceps]: 3, [Muscle.FrontDelts]: 1.5 }), jointVector: J({ [Joint.Elbow]: 2, [Joint.Shoulder]: 2, [Joint.Wrist]: 1 }),
    movementVector: V({ [MP.HorizontalPush]: 1, [MP.AntiExtension]: 1 }), fatigue: 4, skill: 2 },
  { id: "dips", name: "Dips", category: "Press", equipment: { required: [ParallelBars] }, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 2.5, [Muscle.Triceps]: 2, [Muscle.FrontDelts]: 1 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 2, [Joint.Wrist]: 1 }),
    movementVector: V({ [MP.HorizontalPush]: 0.6, [MP.VerticalPush]: 0.4 }), fatigue: 6, skill: 3 },
  { id: "bb-ohp", name: "Barbell overhead press", category: "Press", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.FrontDelts]: 3, [Muscle.Triceps]: 2, [Muscle.SideDelts]: 0.5 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5, [Joint.Wrist]: 1, [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.VerticalPush]: 1, [MP.AntiLateralFlexion]: 0.5 }), fatigue: 6, skill: 3 },
  { id: "db-ohp", name: "Dumbbell overhead press", category: "Press", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.FrontDelts]: 3, [Muscle.Triceps]: 2, [Muscle.SideDelts]: 0.5 }), jointVector: J({ [Joint.Shoulder]: 3, [Joint.Elbow]: 1.5, [Joint.Wrist]: 1, [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.VerticalPush]: 1, [MP.AntiLateralFlexion]: 0.5 }), fatigue: 6, skill: 2 },
  { id: "pike-push-ups", name: "Pike push-ups", category: "Press", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.FrontDelts]: 2, [Muscle.Triceps]: 1.5 }), jointVector: J({ [Joint.Shoulder]: 2.5, [Joint.Wrist]: 2, [Joint.Elbow]: 1.5 }),
    movementVector: V({ [MP.VerticalPush]: 1, [MP.AntiExtension]: 0.5 }), fatigue: 4, skill: 2 },

  // ---- Pull ----
  { id: "pull-ups", name: "Pull-ups", category: "Pull", equipment: { required: [PullUpBar] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 3, [Muscle.Biceps]: 2, [Muscle.RearDelts]: 0.5 }), jointVector: J({ [Joint.Shoulder]: 2, [Joint.Elbow]: 1.5 }),
    movementVector: V({ [MP.VerticalPull]: 1 }), fatigue: 6, skill: 3 },
  { id: "chin-ups", name: "Chin-ups", category: "Pull", equipment: { required: [PullUpBar] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 2.5, [Muscle.Biceps]: 3, [Muscle.RearDelts]: 0.5 }), jointVector: J({ [Joint.Shoulder]: 2, [Joint.Elbow]: 1.5 }),
    movementVector: V({ [MP.VerticalPull]: 1 }), fatigue: 6, skill: 2 },
  { id: "neutral-pull-ups", name: "Neutral-grip pull-ups", category: "Pull", equipment: { required: [PullUpBar] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 3, [Muscle.Biceps]: 2 }), jointVector: J({ [Joint.Shoulder]: 1.5, [Joint.Elbow]: 1.5 }),
    movementVector: V({ [MP.VerticalPull]: 1 }), fatigue: 6, skill: 2 },
  { id: "bb-row", name: "Bent-over barbell row", category: "Pull", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 3, [Muscle.RearDelts]: 2, [Muscle.Biceps]: 1.5 }), jointVector: J({ [Joint.Lumbar]: 2, [Joint.Shoulder]: 1.5, [Joint.Elbow]: 1 }),
    movementVector: V({ [MP.HorizontalPull]: 1, [MP.AntiFlexion]: 1 }), fatigue: 6, skill: 2 },
  { id: "db-row", name: "Bent-over dumbbell row", category: "Pull", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 3, [Muscle.RearDelts]: 2, [Muscle.Biceps]: 1.5 }), jointVector: J({ [Joint.Lumbar]: 2, [Joint.Shoulder]: 1.5, [Joint.Elbow]: 1 }),
    movementVector: V({ [MP.HorizontalPull]: 1, [MP.AntiFlexion]: 1 }), fatigue: 6, skill: 2 },
  { id: "one-arm-db-row", name: "One-arm dumbbell row", category: "Pull", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 3, [Muscle.RearDelts]: 2, [Muscle.Biceps]: 1.5 }), jointVector: J({ [Joint.Shoulder]: 1.5, [Joint.Elbow]: 1 }),
    movementVector: V({ [MP.HorizontalPull]: 1, [MP.AntiRotation]: 1 }), fatigue: 5, skill: 1 },
  { id: "inverted-rows", name: "Inverted rows", category: "Pull", equipment: { required: [LowBar] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 3, [Muscle.RearDelts]: 2, [Muscle.Biceps]: 1.5 }), jointVector: J({ [Joint.Lumbar]: 1.5 }),
    movementVector: V({ [MP.HorizontalPull]: 1, [MP.AntiFlexion]: 0.5 }), fatigue: 3, skill: 1 },

  // ---- Isolations ----
  { id: "lateral-raise", kind: "iso", name: "Lateral raises", category: "Isolations", equipment: { oneOf: [Dumbbell, Kettlebell] }, environment: IO,
    muscleVector: M({ [Muscle.SideDelts]: 3, [Muscle.RearDelts]: 0.5 }), jointVector: J({ [Joint.Shoulder]: 1 }),
    movementVector: V({ [MP.AntiFlexion]: 0.5 }), fatigue: 2, skill: 1 },
  { id: "upright-row", kind: "iso", name: "Upright row", category: "Isolations", equipment: { oneOf: [Dumbbell, Kettlebell, Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.SideDelts]: 3, [Muscle.RearDelts]: 2, [Muscle.SpinalErectors]: 0.5 }), jointVector: J({ [Joint.Shoulder]: 1, [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.AntiFlexion]: 1 }), fatigue: 3, skill: 2 },
  { id: "bb-curl", kind: "iso", name: "Barbell curl", category: "Isolations", equipment: { required: [Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Biceps]: 3, [Muscle.SpinalErectors]: 0.5 }), jointVector: J({ [Joint.Elbow]: 1.5, [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.AntiFlexion]: 0.5 }), fatigue: 3, skill: 1 },
  { id: "db-curl", kind: "iso", name: "Dumbbell curl", category: "Isolations", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Biceps]: 3 }), jointVector: J({ [Joint.Elbow]: 1.5 }),
    movementVector: V({ [MP.AntiFlexion]: 0.5 }), fatigue: 3, skill: 1 },
  { id: "Single-leg-calf-raises", kind: "iso", name: "Single-leg calf raises", category: "Isolations", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Calves]: 3 }), jointVector: J({ [Joint.Ankle]: 1 }),
    movementVector: V({ [MP.AntiFlexion]: 1 }), fatigue: 2, skill: 1 },
{ id: "bb-skull-crusher", kind: "iso", name: "Barbell skull crushers", category: "Isolations", equipment: { required: [Barbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Triceps]: 3 }),
    jointVector: J({ [Joint.Elbow]: 2, [Joint.Shoulder]: 0.5, [Joint.Wrist]: 0.5 }),
    movementVector: V({}), fatigue: 3, skill: 2 },
  { id: "db-skull-crusher", kind: "iso", name: "Dumbbell skull crushers", category: "Isolations", equipment: { required: [Dumbbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Triceps]: 3 }),
    jointVector: J({ [Joint.Elbow]: 1.5, [Joint.Shoulder]: 0.5, [Joint.Wrist]: 0.5 }),
    movementVector: V({}), fatigue: 3, skill: 2 },
  { id: "db-pullover", kind: "iso", name: "Dumbbell pullovers", category: "Isolations", equipment: { required: [Dumbbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.UpperBack]: 2, [Muscle.Chest]: 1.5, [Muscle.Triceps]: 1 }),
    jointVector: J({ [Joint.Shoulder]: 2, [Joint.Elbow]: 0.5 }),
    movementVector: V({ [MP.VerticalPull]: 0.5 }), fatigue: 3, skill: 2 },
  { id: "db-flye", kind: "iso", name: "Dumbbell flyes", category: "Isolations", equipment: { required: [Dumbbell, Bench] }, environment: IO,
    muscleVector: M({ [Muscle.Chest]: 3, [Muscle.FrontDelts]: 1 }),
    jointVector: J({ [Joint.Shoulder]: 2.5, [Joint.Elbow]: 0.5 }),
    movementVector: V({ [MP.HorizontalPush]: 0.5 }), fatigue: 3, skill: 2 },

  // ---- Core ----
  { id: "hanging-leg-raises", name: "Hanging leg-raises", category: "Core", equipment: { required: [PullUpBar] }, environment: IO,
    muscleVector: M({ [Muscle.Abs]: 3, [Muscle.UpperBack]: 1 }), jointVector: J({ [Joint.Shoulder]: 1, [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.AntiExtension]: 1 }), fatigue: 3, skill: 2 },
  { id: "hollow-hold", name: "Hollow hold", category: "Core", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Abs]: 3 }), jointVector: J({ [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.AntiExtension]: 1 }), fatigue: 2, skill: 1 },
  { id: "plank", name: "Plank", category: "Core", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Abs]: 3 }), jointVector: J({ [Joint.Shoulder]: 0.5, [Joint.Elbow]: 0.5 }),
    movementVector: V({ [MP.AntiExtension]: 1 }), fatigue: 2, skill: 1 },
  { id: "bicycle-crunches", name: "Bicycle crunches", category: "Core", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Abs]: 2.5, [Muscle.Obliques]: 2 }), jointVector: J({ [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.Rotational]: 1, [MP.AntiExtension]: 0.5 }), fatigue: 2, skill: 1 },
  { id: "russian-twists", name: "Russian twists", category: "Core", equipment: { oneOf: [Dumbbell, Kettlebell, Barbell] }, environment: IO,
    muscleVector: M({ [Muscle.Obliques]: 3 }), jointVector: J({ [Joint.Lumbar]: 1.5 }),
    movementVector: V({ [MP.Rotational]: 1 }), fatigue: 2, skill: 1 },
  { id: "side-plank", name: "Side plank", category: "Core", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Obliques]: 3 }), jointVector: J({ [Joint.Lumbar]: 1 }),
    movementVector: V({ [MP.AntiLateralFlexion]: 1 }), fatigue: 2, skill: 1 },
  { id: "db-side-bend", name: "Dumbbell side-bend", category: "Core", equipment: { required: [Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Obliques]: 3, [Muscle.SpinalErectors]: 1 }), jointVector: J({ [Joint.Lumbar]: 1.5 }),
    movementVector: V({ [MP.AntiLateralFlexion]: 1 }), fatigue: 2, skill: 1 },
 

  // ---- GPP ----
 { id: "kick-throughs", name: "Kick-throughs", category: "GPP", equipment: {}, environment: ANY,
    muscleVector: M({ [Muscle.Obliques]: 2.5, [Muscle.Abs]: 1.5, [Muscle.FrontDelts]: 1, [Muscle.Quads]: 1, [Muscle.Triceps]: 0.5 }),
    jointVector: J({ [Joint.Wrist]: 1, [Joint.Shoulder]: 1, [Joint.Hip]: 1, [Joint.Knee]: 0.5, [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.Rotational]: 1, [MP.GPP]: 1 }), fatigue: 4, skill: 2 },
  { id: "waiters-carry", kind: "carry", name: "Waiter's carry", category: "GPP", equipment: { oneOf: [Dumbbell, Kettlebell] }, environment: ANY,
    muscleVector: M({ [Muscle.SideDelts]: 2, [Muscle.FrontDelts]: 1.5, [Muscle.Triceps]: 1, [Muscle.Obliques]: 1.5, [Muscle.UpperBack]: 0.5, [Muscle.Abs]: 0.5 }),
    jointVector: J({ [Joint.Shoulder]: 2, [Joint.Elbow]: 1, [Joint.Wrist]: 1, [Joint.Lumbar]: 0.5, [Joint.Hip]: 1, [Joint.Knee]: 1, [Joint.Ankle]: 1 }),
    movementVector: V({ [MP.GPP]: 1, [MP.AntiLateralFlexion]: 1 }), fatigue: 4, skill: 2 },
  { id: "front-carry", kind: "carry", name: "Front carry", category: "GPP", equipment: { oneOf: [Dumbbell, Kettlebell] }, environment: ANY,
    muscleVector: M({ [Muscle.Abs]: 2, [Muscle.UpperBack]: 1.5, [Muscle.SpinalErectors]: 1.5, [Muscle.FrontDelts]: 1, [Muscle.Biceps]: 0.5 }),
    jointVector: J({ [Joint.Shoulder]: 1, [Joint.Elbow]: 1, [Joint.Lumbar]: 1, [Joint.Wrist]: 0.5, [Joint.Hip]: 1, [Joint.Knee]: 1, [Joint.Ankle]: 1 }),
    movementVector: V({ [MP.GPP]: 1, [MP.AntiExtension]: 1 }), fatigue: 5, skill: 1 },

 { id: "mountain-climbers", name: "Mountain climbers", category: "GPP", equipment: {}, environment: ANY,
    muscleVector: M({ [Muscle.Obliques]: 2, [Muscle.Abs]: 2 }), jointVector: J({ [Joint.Wrist]: 0.5, [Joint.Shoulder]: 0.5, [Joint.Ankle]: 1, [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.GPP]: 1, [MP.AntiFlexion]: 1, [MP.AntiRotation]: 1, [MP.GPP]: 1 }), fatigue: 4, skill: 1 },
  { id: "burpees", name: "Burpees", category: "GPP", equipment: {}, environment: ANY,
    muscleVector: M({ [Muscle.Hamstrings]: 2, [Muscle.Glutes]: 2, [Muscle.Quads]: 1.5, [Muscle.Calves]: 2 }), jointVector: J({ [Joint.Ankle]: 2.5, [Joint.Knee]: 2, [Joint.Hip]: 2 }),
    movementVector: V({ [MP.GPP]: 1 }), fatigue: 8, skill: 2 },
  { id: "jump-squat", kind: "power", name: "Jump squats", category: "GPP", equipment: {}, environment: IO,
    muscleVector: M({ [Muscle.Quads]: 2, [Muscle.Glutes]: 2, [Muscle.Calves]: 1 }), jointVector: J({ [Joint.Knee]: 3, [Joint.Ankle]: 1.5, [Joint.Hip]: 2.5 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1, [MP.GPP]: 1 }), fatigue: 6, skill: 2 },
  { id: "box-jumps", kind: "power", name: "Box jumps", category: "GPP", equipment: { required: [Box] }, environment: ANY,
    muscleVector: M({ [Muscle.Quads]: 2, [Muscle.Glutes]: 2, [Muscle.Calves]: 1 }), jointVector: J({ [Joint.Knee]: 2.5, [Joint.Ankle]: 1.5, [Joint.Hip]: 2 }),
    movementVector: V({ [MP.KneeDominant]: 1, [MP.HipDominant]: 1, [MP.GPP]: 1 }), fatigue: 6, skill: 2 },
  { id: "sprints", name: "Sprints", category: "GPP", equipment: {}, environment: OPEN,
    muscleVector: M({ [Muscle.Hamstrings]: 2, [Muscle.Glutes]: 2, [Muscle.Quads]: 1, [Muscle.Calves]: 2 }), jointVector: J({ [Joint.Ankle]: 2, [Joint.Knee]: 1.5, [Joint.Hip]: 1.5 }),
    movementVector: V({ [MP.GPP]: 1 }), fatigue: 7, skill: 1 },
  { id: "rope-skipping", name: "Rope skipping", category: "GPP", equipment: { required: [Rope] }, environment: ANY,
    muscleVector: M({ [Muscle.Calves]: 2 }), jointVector: J({ [Joint.Ankle]: 2, [Joint.Wrist]: 0.5, [Joint.Knee]: 1 }),
    movementVector: V({ [MP.GPP]: 1 }), fatigue: 4, skill: 2 },
  { id: "high-knees", name: "High knees", category: "GPP", equipment: {}, environment: ANY,
    muscleVector: M({ [Muscle.Quads]: 1, [Muscle.Calves]: 1 }), jointVector: J({ [Joint.Hip]: 0.5, [Joint.Ankle]: 1, [Joint.Knee]: 1 }),
    movementVector: V({ [MP.GPP]: 1 }), fatigue: 4, skill: 1 },
  { id: "bear-crawl", name: "Bear crawl", category: "GPP", equipment: {}, environment: ANY,
    muscleVector: M({ [Muscle.Abs]: 1.5, [Muscle.Obliques]: 1.5, [Muscle.FrontDelts]: 1, [Muscle.Quads]: 1 }), jointVector: J({ [Joint.Wrist]: 1, [Joint.Shoulder]: 1, [Joint.Knee]: 1, [Joint.Hip]: 1, [Joint.Ankle]: 1 }),
    movementVector: V({ [MP.GPP]: 1, [MP.AntiRotation]: 1, [MP.AntiExtension]: 1 }), fatigue: 4, skill: 1 },
  { id: "farmers-carry", kind: "carry", name: "Farmer's carry", category: "GPP", equipment: { oneOf: [Dumbbell, Kettlebell] }, environment: ANY,
    muscleVector: M({ [Muscle.UpperBack]: 1.5, [Muscle.SpinalErectors]: 1, [Muscle.Abs]: 1.5, [Muscle.Calves]: 0.5, [Muscle.SideDelts]: 0.5, [Muscle.RearDelts]: 0.5 }), jointVector: J({ [Joint.Wrist]: 1, [Joint.Shoulder]: 1, [Joint.Knee]: 1, [Joint.Hip]: 1, [Joint.Ankle]: 1, [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.GPP]: 1, [MP.AntiFlexion]: 1 }), fatigue: 5, skill: 1 },
  { id: "suitcase-carry", kind: "carry", name: "Suitcase carry", category: "GPP", equipment: { oneOf: [Dumbbell, Kettlebell] }, environment: ANY,
    muscleVector: M({ [Muscle.Obliques]: 3, [Muscle.UpperBack]: 1, [Muscle.SideDelts]: 0.5 }), jointVector: J({ [Joint.Wrist]: 1, [Joint.Shoulder]: 1, [Joint.Knee]: 1, [Joint.Hip]: 1, [Joint.Ankle]: 1, [Joint.Lumbar]: 0.5 }),
    movementVector: V({ [MP.GPP]: 1, [MP.AntiLateralFlexion]: 1 }), fatigue: 4, skill: 1 },
  { id: "clean-and-jerk", kind: "power", name: "Clean & jerk", category: "GPP", equipment: { oneOf: [Barbell, Dumbbell, Kettlebell] }, environment: IO,
    muscleVector: M({ [Muscle.Glutes]: 2, [Muscle.Hamstrings]: 2, [Muscle.UpperBack]: 1.5, [Muscle.FrontDelts]: 1, [Muscle.Triceps]: 1 }), jointVector: J({ [Joint.Hip]: 2, [Joint.Shoulder]: 1.5, [Joint.Knee]: 1.5, [Joint.Wrist]: 1.5, [Joint.Lumbar]: 1.5 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.GPP]: 1, [MP.VerticalPush]: 0.5, [MP.AntiFlexion]: 0.5 }), fatigue: 7, skill: 4 },
  { id: "power-snatch", kind: "power", name: "Power snatch", category: "GPP", equipment: { oneOf: [Barbell, Dumbbell] }, environment: IO,
    muscleVector: M({ [Muscle.Glutes]: 2, [Muscle.Hamstrings]: 2, [Muscle.UpperBack]: 1.5, [Muscle.FrontDelts]: 0.5, [Muscle.RearDelts]: 0.5, [Muscle.SideDelts]: 0.5 }), jointVector: J({ [Joint.Hip]: 2, [Joint.Shoulder]: 1.5, [Joint.Knee]: 1.5, [Joint.Wrist]: 1.5, [Joint.Lumbar]: 1.5 }),
    movementVector: V({ [MP.HipHinge]: 1, [MP.HipDominant]: 1, [MP.GPP]: 1, [MP.VerticalPush]: 0.5 }), fatigue: 7, skill: 4 },
];
const DS_CATS = ["Knee dominant", "Hip dominant", "Press", "Pull", "Isolations", "Core", "GPP"];
const EX_BY_ID = Object.fromEntries(EXDB.map((e) => [e.id, e]));

/* ---- dataset validation ------------------------------------------- */
function validateDatabase() {
  const problems = [];
  const eqKeys = new Set(EQUIP.map((e) => e.key));
  const envVals = new Set(ENVS.map((e) => e.key));
  const seen = new Set();
  EXDB.forEach((e, i) => {
    const at = "row " + (i + 1) + " (" + (e.id || "?") + "): ";
    if (!e.id || seen.has(e.id)) problems.push(at + "missing/duplicate id");
    seen.add(e.id);
    if (!DS_CATS.includes(e.category)) problems.push(at + "unknown category " + e.category);
    if (e.muscleVector.length !== MUSCLE_COUNT) problems.push(at + "muscleVector length " + e.muscleVector.length);
    if (e.jointVector.length !== JOINT_COUNT) problems.push(at + "jointVector length " + e.jointVector.length);
    if (e.movementVector.length !== MOVEMENT_COUNT) problems.push(at + "movementVector length " + e.movementVector.length);
    const eq = e.equipment || {};
    [...(eq.required || []), ...(eq.oneOf || [])].forEach((k) => { if (!eqKeys.has(k)) problems.push(at + "unknown equipment " + k); });
    (e.environment || []).forEach((v) => { if (!envVals.has(v)) problems.push(at + "bad env " + v); });
  });
  if (problems.length) { try { console.warn("Trning dataset problems:\n" + problems.map((p) => " • " + p).join("\n")); } catch (err) {} }
  return problems;
}
const DB_PROBLEMS = validateDatabase();

function exAvail(e, availSet, envSet) {
  const eq = e.equipment || {};
  const reqOk = (eq.required || []).every((k) => availSet.has(k));
  const oneOfOk = !eq.oneOf || eq.oneOf.length === 0 || eq.oneOf.some((k) => availSet.has(k));
  const envOk = envSet.size === 0 || (e.environment || []).some((v) => envSet.has(v));
  return reqOk && oneOfOk && envOk;
}

/* ---- engine ------------------------------------------------------- */
function filterCandidates(db, cons) {
  return db.filter((e) => !cons.excludedExercises.has(e.id) && e.skill <= cons.maxSkill && exAvail(e, cons.availableEquipment, cons.environment));
}
function scoreExercise(e, state, cons, cfg, rng) {
  const demand = state.remainingDemand.map((d, i) => d * (1 - clamp01(cons.muscleSoreness[i] || 0)));
  // how much of this exercise's muscle work lands on sore tissue (0..1) — damps the movement term too,
  // otherwise compounds keep scoring ~69% of their points through never-damped movement demand
  const credit = vsum(e.muscleVector);
  const soreScale = credit > 0 ? 1 - clamp01(dot(e.muscleVector, cons.muscleSoreness) / credit) : 1;
  const prio = cons.prioritizedExercises && cons.prioritizedExercises.has(e.id) ? cfg.priorityMultiplier : 1;
  // movement vector L1-normalized: overlapping patterns (HipHinge⊂HipDominant etc.) otherwise
  // double-count and let hinge-type lifts outscore per unit of demand (measured 2.67 vs 1.41 mass)
  const mvMass = Math.max(1, vsum(e.movementVector));
  const positive = dot(e.muscleVector, demand) + soreScale * (dot(e.movementVector, cfg.movementDemand) / mvMass);
  return (
    prio * positive -
    cfg.muscleWeight * dot(e.muscleVector, state.muscleUsage) -
    cfg.jointWeight * dot(e.jointVector, cons.jointSoreness) -
    cfg.movementWeight * dot(e.movementVector, state.movementUsage) -
    cfg.fatigueWeight * e.fatigue
  );
}
function weightedSampleIndex(weights, rng) {
  let total = 0; for (const w of weights) total += w;
  if (total <= 0) return -1;
  let u = rng() * total;
  for (let i = 0; i < weights.length; i++) { u -= weights[i]; if (u < 0) return i; }
  return weights.length - 1;
}
const initialState = (cfg) => ({ remainingDemand: [...cfg.mev], muscleUsage: zeros(MUSCLE_COUNT), movementUsage: zeros(MOVEMENT_COUNT), fatigue: 0, selected: [] });
const applySelection = (st, e) => ({
  remainingDemand: clampMin(subtract(st.remainingDemand, e.muscleVector), 0),
  muscleUsage: add(st.muscleUsage, e.muscleVector), movementUsage: add(st.movementUsage, e.movementVector),
  fatigue: st.fatigue + e.fatigue, selected: [...st.selected, e],
});
function generateWorkout(db, cons, cfg, rng = Math.random) {
  let cands = filterCandidates(db, cons);
  let st = initialState(cfg);
  while (st.selected.length < cfg.workoutSize && cands.length) {
    const scored = cands.map((e) => ({ e, s: scoreExercise(e, st, cons, cfg, rng) }));
    const pos = scored.filter((x) => x.s > 0);
    if (!pos.length) break;
    const idx = weightedSampleIndex(pos.map((x) => x.s), rng);
    const pick = pos[idx].e;
    st = applySelection(st, pick);
    cands = cands.filter((c) => c.id !== pick.id);
  }
  return { exercises: st.selected, finalState: st };
}
const stateFor = (exs, cfg) => { let st = initialState(cfg); exs.forEach((e) => { st = applySelection(st, e); }); return st; };
function finalizeWorkout(exs, cfg) {
  const ordered = [...exs].sort((a, b) => kindOrder(a) - kindOrder(b));
  return { exercises: ordered, finalState: stateFor(ordered, cfg) };
}
function swapSlot(db, workout, i, cons, cfg, avoid) {
  const others = workout.exercises.filter((_, j) => j !== i);
  const st = stateFor(others, cfg);
  const selIds = new Set(workout.exercises.map((e) => e.id));
  let cands = filterCandidates(db, cons).filter((e) => !selIds.has(e.id) && !avoid.has(e.id));
  if (!cands.length) cands = filterCandidates(db, cons).filter((e) => !selIds.has(e.id));
  if (!cands.length) return null;
  const scored = cands.map((e) => ({ e, s: scoreExercise(e, st, cons, cfg, Math.random) }));
  const pos = scored.filter((x) => x.s > 0);
  let pick;
  if (pos.length) pick = pos[weightedSampleIndex(pos.map((x) => x.s), Math.random)].e;
  else { scored.sort((a, b) => b.s - a.s); pick = scored[0].e; }
  const next = [...workout.exercises];
  next[i] = pick;
  return { exercises: next, finalState: stateFor(next, cfg) };
}

/* ---- UI ↔ engine mappings ----------------------------------------- */
const READINESS = [
  { key: "fresh", label: "Fresh", color: "#7FB48A" }, { key: "ok", label: "OK", color: "#F5B14C" }, { key: "tired", label: "Tired", color: "#F87171" },
];
const READY_CFG = {
  fresh: { workoutSize: 4, maxSkill: 5, fatigueWeight: 0.25 },
  ok: { workoutSize: 4, maxSkill: 4, fatigueWeight: 0.45 },
  tired: { workoutSize: 3, maxSkill: 2, fatigueWeight: 1.0 },
};
const RPE_LINE = {
  fresh: "Fresh — take working sets to RPE 8 (≈2 reps in reserve). Load up.",
  ok: "Moderate — RPE 7 (≈3 in reserve).",
  tired: "Low readiness — everything RPE 5–6, light and clean.",
};
const FOCUS = [{ key: "strength", label: "Strength" }, { key: "balanced", label: "Balanced" }, { key: "conditioning", label: "Conditioning" }];
const FOCUS_DEMAND = {
  strength:     [3, 3, 3, 3, 3, 3, 3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.4],
  balanced:     [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 1, 1, 1, 1, 1],
  conditioning: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 1.2, 1.2, 1.2, 1.2, 1.2, 5],
};
const COVERAGE_GAIN = 0.5;
const HISTORY_DEPTH = 12;    // recent window used for coverage + carryover
const HISTORY_CAP = 250;     // how many sessions the log keeps

function kindOf(e) {
  if (e.kind) return e.kind; // explicit override: power / carry
  if (MAIN_PATTERNS.some((p) => e.movementVector[p] >= 1)) return "strength";
  if (e.movementVector[MP.GPP] >= 1) return "conditioning";
  return "core";
}
const KIND_ORDER = { power: 0, strength: 1, carry: 2, GPP: 3, core: 4, iso: 5 };
const kindOrder = (e) => KIND_ORDER[kindOf(e)] ?? 9;
const FMTS = {
  fresh: { power: "4 × 3–5 · crisp, full rest", strength: "3–4 × 6–10", carry: "3 × ~30 m", GPP: "3–5 rounds · hard", core: "3 × 10–15 / holds", iso: "3 x 8-15" },
  ok: { power: "3 × 3–5 · crisp, full rest", strength: "3–4 × 6–10", carry: "3 × ~30 m", GPP: "3–4 rounds · moderate", core: "3 × 10–15 / holds", iso: "3 x 8-15"  },
  tired: { power: "2 × 3 · light, crisp", strength: "3 × 8–10 · light", carry: "2 × ~30 m · light", GPP: "2–3 rounds · easy", core: "2 × 10–12 / holds", iso: "3 x 8-15"  },
};

const histIds = (h) => (h.ids ? h.ids : (h.entries || []).map((x) => x.exId));
function patternGaps(history) {
  const seen = new Array(MOVEMENT_COUNT).fill(-1);
  (history || []).forEach((h, idx) => {
    histIds(h).forEach((id) => {
      const e = EX_BY_ID[id]; if (!e) return;
      for (let p = 0; p < MOVEMENT_COUNT; p++) if (e.movementVector[p] > 0 && seen[p] === -1) seen[p] = idx;
    });
  });
  return seen.map((v) => (v === -1 ? HISTORY_DEPTH : v));
}
const coverageBoostedDemand = (base, gaps) => base.map((b, p) => (b > 0 ? b + COVERAGE_GAIN * Math.min(gaps[p], HISTORY_DEPTH) : 0));

const HARD_LOAD = 1;
function buildConstraints(equipment, soreM, soreJ, carry, prioEx) {
  const excluded = new Set();
  EXDB.forEach((e) => {
    for (let i = 0; i < MUSCLE_COUNT; i++) if (soreM[i] && e.muscleVector[i] >= HARD_LOAD) { excluded.add(e.id); return; }
    for (let j = 0; j < JOINT_COUNT; j++) if (soreJ[j] && e.jointVector[j] >= HARD_LOAD) { excluded.add(e.id); return; }
  });
  const muscleSoreness = carry.map((c, i) => Math.min(1, Math.max(c, soreM[i] ? 1 : 0)));
  return {
    availableEquipment: new Set(EQUIP.filter((q) => equipment[q.key]).map((q) => q.key)),
    environment: new Set(ENVS.filter((v) => equipment[v.key]).map((v) => v.key)),
    excludedExercises: excluded, muscleSoreness, jointSoreness: soreJ.map((s) => (s ? 3 : 0)), maxSkill: 5, prioritizedExercises: prioEx,
  };
}
function carrySoreness(history, mev) {
  const now = Date.now();
  const carry = zeros(MUSCLE_COUNT);
  (history || []).forEach((h) => {
    const days = (now - h.ts) / 86400000;
    const w = days < 1.2 ? 0.6 : days < 2.2 ? 0.3 : 0;
    if (!w) return;
    const credit = h.credit || sessionCredit(h);
    for (let i = 0; i < MUSCLE_COUNT; i++) carry[i] = Math.min(1, carry[i] + w * Math.min(1, (credit[i] || 0) / Math.max(1, mev[i])));
  });
  return carry;
}
function sessionCredit(h) {
  let c = zeros(MUSCLE_COUNT);
  histIds(h).forEach((id) => { const e = EX_BY_ID[id]; if (e) c = add(c, e.muscleVector); });
  return c;
}

/* e1RM: RTS RPE→%1RM chart, 1–10 rep loaded sets at RPE 6.5–10 */
const RPE_PCT = {
  10: [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9], 9.5: [97.8, 93.9, 90.7, 87.8, 85, 82.4, 79.9, 77.4, 75.1, 72.3],
  9: [95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7], 8.5: [93.9, 90.7, 87.8, 85, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4],
  8: [92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68], 7.5: [90.7, 87.8, 85, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4, 66.7],
  7: [89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68, 65.3], 6.5: [87.8, 85, 82.4, 79.9, 77.4, 75.1, 72.3, 69.4, 66.7, 64],
};
function e1rm(w, r, rpe) {
  if (!w || !r || !rpe || rpe < 6.5) return null;
  const R = Math.min(10, Math.max(6.5, Math.round(rpe * 2) / 2));
  const reps = Math.round(r);
  if (reps < 1 || reps > 10) return null;
  const p = RPE_PCT[R] && RPE_PCT[R][reps - 1];
  return p ? w / (p / 100) : null;
}
const bestE1rm = (sets) => (sets || []).reduce((m, sx) => Math.max(m, e1rm(+sx.w, +sx.r, +sx.rpe) || 0), 0);
/* most recent prior session (before ts) that logged this exId with sets */
function priorEntry(history, exId, beforeTs) {
  for (const h of history) {
    if (h.ts >= beforeTs) continue;
    const en = (h.entries || []).find((x) => x.exId === exId && x.sets && x.sets.length);
    if (en) return { ts: h.ts, sets: en.sets };
  }
  return null;
}

/* progress series for one exercise: chronological logged sessions */
function goalSeries(history, exId) {
  const out = [];
  for (const h of history || []) {
    const en = (h.entries || []).find((x) => x.exId === exId && x.sets && x.sets.length);
    if (!en) continue;
    out.push({ ts: h.ts, e1: bestE1rm(en.sets), reps: en.sets.reduce((m, sx) => Math.max(m, +sx.r || 0), 0), sets: en.sets });
  }
  return out.reverse();
}

/* ---- persistence -------------------------------------------------- */
const KEYS = { eq: "brak4-eq", soreM: "brak4-sorem", soreJ: "brak4-sorej", prio: "brak4-prio", focus: "brak4-focus", hist: "brak4-hist", body: "brak4-body", height: "brak4-height" };
const store = {
  /* Claude artifact storage when available; plain-browser localStorage otherwise.
     Same string values either way, so the app is portable between the two. */
  async get(key) {
    try { if (typeof window !== "undefined" && window.storage) { const r = await window.storage.get(key, false); return r ? r.value : null; } } catch (e) {}
    try { if (typeof window !== "undefined" && window.localStorage) return window.localStorage.getItem(key); } catch (e) {}
    return null;
  },
  async set(key, val) {
    try { if (typeof window !== "undefined" && window.storage) { await window.storage.set(key, val, false); return; } } catch (e) {}
    try { if (typeof window !== "undefined" && window.localStorage) window.localStorage.setItem(key, val); } catch (e) {}
  },
};
const EQ_DEFAULT = Object.fromEntries([...EQUIP.map((e) => [e.key, false]), ...ENVS.map((e) => [e.key, true])]);

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dayStamp = (ts) => { const d = new Date(ts); return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate(); };
const setSummary = (sets) => (sets || []).map((sx) => (sx.w ? sx.w + "×" : "") + (sx.r || "–")).join("  ");

/* ---- UI atoms ----------------------------------------------------- */
function Toggle({ active, color, onClick, children }) {
  return (<button onClick={onClick} className="py-2 px-3.5 rounded-lg text-xs font-mono transition focus:outline-none" style={{ minHeight: 44, backgroundColor: active ? color + "14" : C.surface2, color: active ? color : C.muted, border: "1px solid " + (active ? color + "66" : C.border) }}>{active ? "● " : "○ "}{children}</button>);
}
/* iOS-style swipe-to-delete row: swipe left reveals Delete, tap it to remove. */
function SwipeRow({ onDelete, onClick, children, radius = 16 }) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const ref = useRef({ x: 0, y: 0, horiz: null, moved: false });
  const W = 78;
  const onTouchStart = (e) => { const t = e.touches[0]; ref.current = { x: t.clientX, y: t.clientY, horiz: null, moved: false }; setDrag(true); };
  const onTouchMove = (e) => {
    const r = ref.current; const t = e.touches[0];
    const ddx = t.clientX - r.x, ddy = t.clientY - r.y;
    if (r.horiz === null) { if (Math.abs(ddx) < 7 && Math.abs(ddy) < 7) return; r.horiz = Math.abs(ddx) > Math.abs(ddy) * 1.2; }
    if (!r.horiz) return;
    r.moved = true;
    const base = open ? -W : 0;
    setDx(Math.max(-W - 16, Math.min(8, base + ddx)));
  };
  const onTouchEnd = () => {
    setDrag(false);
    const r = ref.current; if (!r.horiz) return;
    const willOpen = dx < -W * 0.5;
    setOpen(willOpen); setDx(willOpen ? -W : 0);
  };
  const handleClick = () => {
    if (ref.current.moved) { ref.current.moved = false; return; }
    if (open) { setOpen(false); setDx(0); return; }
    if (onClick) onClick();
  };
  return (
    <div className="relative overflow-hidden" style={{ borderRadius: radius }}>
      <button onClick={() => { setOpen(false); setDx(0); onDelete(); }} aria-label="Delete entry" className="absolute inset-y-0 right-0 flex items-center justify-center font-mono text-xs font-semibold uppercase focus:outline-none" style={{ width: W, backgroundColor: C.warn + "26", color: C.warn }}>Delete</button>
      <div role={onClick ? "button" : undefined} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onClick={handleClick}
        style={{ transform: "translateX(" + dx + "px)", transition: drag ? "none" : "transform 160ms ease", cursor: onClick ? "pointer" : "default" }}>
        {children}
      </div>
    </div>
  );
}
function Spark({ values, color, w = 132, h = 30 }) {
  const vals = (values || []).filter((v) => v > 0);
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => ((i / (vals.length - 1)) * (w - 4) + 2) + "," + (h - 3 - ((v - min) / span) * (h - 6))).join(" ");
  return (<svg width={w} height={h} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>);
}
function BigChart({ points, color, unit }) {
  const pts = (points || []).filter((p) => p.v > 0);
  if (pts.length < 2) return (<div className="font-mono text-xs py-6 text-center" style={{ color: C.dim }}>Need at least two logged points for a chart.</div>);
  const W = 360, H = 230, L = 46, R = 14, T = 18, B = 30;
  const xs = pts.map((p) => p.ts), vs = pts.map((p) => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let v0 = Math.min(...vs), v1 = Math.max(...vs);
  const pad = (v1 - v0) * 0.1 || Math.abs(v1) * 0.05 || 1;
  v0 -= pad; v1 += pad;
  const X = (t) => L + ((t - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B);
  const fmt = (v) => (v1 - v0 >= 20 ? v.toFixed(0) : v.toFixed(1));
  const ticks = [0, 1, 2, 3].map((i) => v0 + ((v1 - v0) * i) / 3);
  const line = pts.map((p) => X(p.ts) + "," + Y(p.v)).join(" ");
  const last = pts[pts.length - 1], mid = pts[Math.floor((pts.length - 1) / 2)];
  return (
    <svg viewBox={"0 0 " + W + " " + H} width="100%" style={{ display: "block" }} role="img">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={C.border} strokeWidth="1" />
          <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill={C.dim}>{fmt(v)}</text>
        </g>
      ))}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (<circle key={i} cx={X(p.ts)} cy={Y(p.v)} r={i === pts.length - 1 ? 4 : 2.5} fill={i === pts.length - 1 ? color : C.bg} stroke={color} strokeWidth="1.5" />))}
      <text x={Math.min(X(last.ts), W - R - 4)} y={Math.max(Y(last.v) - 9, 11)} textAnchor="end" fontSize="11" fontFamily="ui-monospace, monospace" fill={color}>{fmt(last.v)}{unit ? " " + unit : ""}</text>
      <text x={L} y={H - 8} fontSize="10" fontFamily="ui-monospace, monospace" fill={C.dim}>{fmtDate(x0)}</text>
      {pts.length > 2 && X(mid.ts) > L + 70 && X(mid.ts) < W - R - 70 ? <text x={X(mid.ts)} y={H - 8} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill={C.dim}>{fmtDate(mid.ts)}</text> : null}
      <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fontFamily="ui-monospace, monospace" fill={C.dim}>{fmtDate(x1)}</text>
    </svg>
  );
}
function Chip({ children }) { return (<span className="font-mono text-xs px-2 py-0.5 rounded-full border" style={{ color: C.dim, borderColor: C.border }}>{children}</span>); }
function Section({ title, note, open, onToggle, children }) {
  return (
    <div className="mt-4 rounded-2xl overflow-hidden" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 focus:outline-none">
        <span className="font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>{title}{note ? <span style={{ opacity: 0.7 }}> · {note}</span> : null}</span>
        <span className="font-mono text-sm" style={{ color: C.dim }}>{open ? "–" : "+"}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
/* Per-exercise set logger — available for every exercise. */
function Logger({ ex, history, draft, setDraftVal, readiness, accent }) {
  const [openL, setOpenL] = useState(false);
  const nSets = readiness === "tired" ? 3 : 4;
  const cur = draft[ex.id] || [];
  const hasDraft = cur.some((sx) => sx && (sx.w || sx.r));
  const bestE = bestE1rm(cur);
  const prev = priorEntry(history, ex.id, Date.now() + 1e13);
  const prevE = prev ? bestE1rm(prev.sets) : 0;
  const prevTxt = prev ? setSummary(prev.sets) + (prevE ? " · e1RM " + prevE.toFixed(0) : "") : null;
  const inp = { width: 50, textAlign: "center", backgroundColor: C.surface2, border: "1px solid " + C.border, color: C.text, borderRadius: 6, padding: "4px 2px", fontSize: 13 };
  const summary = hasDraft
    ? (bestE > 0 ? "e1RM ≈ " + bestE.toFixed(1) + (prevE ? " (" + (bestE >= prevE ? "+" : "") + (bestE - prevE).toFixed(1) + " vs last)" : "") : setSummary(cur) + " logged")
    : (prevTxt ? "last: " + prevTxt : "tap to log sets");
  return (
    <div className="mt-1 mb-1 rounded-xl overflow-hidden" style={{ marginLeft: 28, backgroundColor: C.bg, border: "1px solid " + C.border }}>
      <button onClick={() => setOpenL((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 focus:outline-none">
        <span className="font-mono text-xs truncate" style={{ color: hasDraft ? accent : C.dim }}>{summary}</span>
        <span className="font-mono text-xs shrink-0 ml-2" style={{ color: openL ? C.dim : accent }}>{openL ? "–" : "log"}</span>
      </button>
      {openL && (
        <div className="px-3 pb-2">
          {Array.from({ length: nSets }).map((_, i) => {
            const sx = cur[i] || {};
            return (
              <div key={i} className="flex items-center gap-1.5 mb-1">
                <span className="font-mono text-xs w-3" style={{ color: C.dim }}>{i + 1}</span>
                <input inputMode="decimal" value={sx.w ?? ""} placeholder="kg" onChange={(e) => setDraftVal(ex.id, i, { w: e.target.value.replace(",", ".") })} style={inp} />
                <span className="font-mono text-xs" style={{ color: C.dim }}>×</span>
                <input inputMode="numeric" value={sx.r ?? ""} placeholder="reps" onChange={(e) => setDraftVal(ex.id, i, { r: e.target.value.replace(",", ".") })} style={inp} />
                <span className="font-mono text-xs" style={{ color: C.dim }}>@</span>
                <input inputMode="decimal" value={sx.rpe ?? ""} placeholder="rpe" onChange={(e) => setDraftVal(ex.id, i, { rpe: e.target.value.replace(",", ".") })} style={{ ...inp, width: 42 }} />
              </div>
            );
          })}
          <div className="font-mono text-xs mt-1" style={{ color: C.dim }}>Weight optional (leave blank for bodyweight). e1RM needs kg × reps @ RPE.</div>
        </div>
      )}
    </div>
  );
}

/* ---- the app ------------------------------------------------------ */
export default function TrningGenerator() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("home");
  const [equipment, setEquipment] = useState({ ...EQ_DEFAULT, dumbbell: true, bar: true });
  const [soreM, setSoreM] = useState(zeros(MUSCLE_COUNT));
  const [soreJ, setSoreJ] = useState(zeros(JOINT_COUNT));
  const [prioId, setPrioId] = useState(null);
  const [body, setBody] = useState([]);
  const [heightCm, setHeightCm] = useState("");
  const [bwDraft, setBwDraft] = useState("");
  const [waistDraft, setWaistDraft] = useState("");
  const [focus, setFocus] = useState("balanced");
  const [readiness, setReadiness] = useState("ok");
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState({});
  const [workout, setWorkout] = useState(null);
  const [swapAvoid, setSwapAvoid] = useState({});
  const [openCat, setOpenCat] = useState(null);
  const [openSession, setOpenSession] = useState(null);
  const [saved, setSaved] = useState(false);
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    (async () => {
      try { const v = await store.get(KEYS.eq); if (v) setEquipment({ ...EQ_DEFAULT, ...JSON.parse(v) }); } catch (e) {}
      try { const v = await store.get(KEYS.soreM); if (v) { const a = JSON.parse(v); if (Array.isArray(a) && a.length === MUSCLE_COUNT) setSoreM(a); } } catch (e) {}
      try { const v = await store.get(KEYS.soreJ); if (v) { const a = JSON.parse(v); if (Array.isArray(a) && a.length === JOINT_COUNT) setSoreJ(a); } } catch (e) {}
      try { const v = await store.get(KEYS.prio); if (v) { let id = null; try { const a = JSON.parse(v); id = Array.isArray(a) ? a.find((x) => EX_BY_ID[x]) : (EX_BY_ID[a] ? a : null); } catch (e2) { id = EX_BY_ID[v] ? v : null; } if (id) setPrioId(id); } } catch (e) {}
      try { const v = await store.get(KEYS.body); if (v) { const a = JSON.parse(v); if (Array.isArray(a)) setBody(a); } } catch (e) {}
      try { const v = await store.get(KEYS.height); if (v && +v > 0) setHeightCm(String(v)); } catch (e) {}
      try { const v = await store.get(KEYS.focus); if (v && FOCUS.some((f) => f.key === v)) setFocus(v); } catch (e) {}
      try { const v = await store.get(KEYS.hist); if (v) { const a = JSON.parse(v); if (Array.isArray(a)) setHistory(a); } } catch (e) {}
      setLoading(false);
    })();
  }, []);
  useEffect(() => { if (!loading) store.set(KEYS.hist, JSON.stringify(history)); }, [history, loading]);

  const accent = C.accent;
  const recent = useMemo(() => history.slice(0, HISTORY_DEPTH), [history]);
  const carry = useMemo(() => carrySoreness(recent, mevForWorkout(4)), [recent]);
  const cfg = useMemo(() => {
    const size = READY_CFG[readiness].workoutSize;
    return { ...BASE_CONFIG, ...READY_CFG[readiness], mev: mevForWorkout(size), movementDemand: coverageBoostedDemand(FOCUS_DEMAND[focus], patternGaps(recent)) };
  }, [readiness, focus, recent]);
  const constraints = useMemo(() => {
    const c = buildConstraints(equipment, soreM, soreJ, carry, new Set(prioId ? [prioId] : []));
    c.maxSkill = READY_CFG[readiness].maxSkill;
    return c;
  }, [equipment, soreM, soreJ, carry, prioId, readiness]);

  const blockedLabels = useMemo(() => [...MUSCLE_LABELS.filter((_, i) => soreM[i]), ...JOINT_LABELS.filter((_, j) => soreJ[j])].map((s) => s.toLowerCase()), [soreM, soreJ]);
  const hotChips = useMemo(() => MUSCLE_LABELS.map((l, i) => ({ l, v: carry[i] })).filter((x) => x.v >= 0.25).sort((a, b) => b.v - a.v).slice(0, 4).map((x) => x.l), [carry]);

  const generate = useCallback(() => {
    const w = generateWorkout(EXDB, constraints, cfg, Math.random);
    setWorkout(finalizeWorkout(w.exercises, cfg));
    setSwapAvoid({}); setDraft({}); setConfirmShuffle(false); setView("session");
  }, [constraints, cfg]);

  const hasLoggedDraft = useMemo(() => !!workout && workout.exercises.some((e) => (draft[e.id] || []).some((sx) => sx && (sx.w || sx.r))), [workout, draft]);
  const reshuffle = useCallback(() => {
    if (hasLoggedDraft && !confirmShuffle) { setConfirmShuffle(true); setTimeout(() => setConfirmShuffle(false), 3500); return; }
    generate();
  }, [hasLoggedDraft, confirmShuffle, generate]);

  const doSwap = useCallback((i) => {
    if (!workout) return;
    const curId = workout.exercises[i].id;
    const avoid = new Set([...(swapAvoid[i] || []), curId]);
    let next = swapSlot(EXDB, workout, i, constraints, cfg, avoid);
    if (!next) { next = swapSlot(EXDB, workout, i, constraints, cfg, new Set([curId])); if (next) setSwapAvoid((h) => ({ ...h, [i]: [] })); }
    if (!next) return;
    setSwapAvoid((h) => ({ ...h, [i]: [...(h[i] || []), curId] }));
    setWorkout(next);
  }, [workout, constraints, cfg, swapAvoid]);

  const setDraftVal = useCallback((exId, i, patch) => setDraft((d) => { const arr = (d[exId] || []).slice(); arr[i] = { ...(arr[i] || {}), ...patch }; return { ...d, [exId]: arr }; }), []);

  const done = useCallback(() => {
    if (!workout || !workout.exercises.length) return;
    const entries = workout.exercises.map((e) => ({
      exId: e.id, name: e.name,
      sets: (draft[e.id] || []).filter((sx) => sx && (sx.w || sx.r)).map((sx) => ({ w: sx.w || "", r: sx.r || "", rpe: sx.rpe || "" })),
    }));
    let credit = zeros(MUSCLE_COUNT);
    workout.exercises.forEach((e) => { credit = add(credit, e.muscleVector); });
    const rec = { id: "s" + Date.now(), ts: Date.now(), focus, readiness, credit, entries };
    setHistory((h) => [rec, ...h].slice(0, HISTORY_CAP));
    setWorkout(null); setDraft({}); setSwapAvoid({});
    setView("home"); setSaved(true); setTimeout(() => setSaved(false), 2200);
  }, [workout, draft, focus, readiness]);

  const toggleEq = useCallback((key) => setEquipment((v) => { const n = { ...v, [key]: !v[key] }; store.set(KEYS.eq, JSON.stringify(n)); return n; }), []);
  const toggleSoreM = useCallback((i) => setSoreM((v) => { const n = v.slice(); n[i] = n[i] ? 0 : 1; store.set(KEYS.soreM, JSON.stringify(n)); return n; }), []);
  const toggleSoreJ = useCallback((j) => setSoreJ((v) => { const n = v.slice(); n[j] = n[j] ? 0 : 1; store.set(KEYS.soreJ, JSON.stringify(n)); return n; }), []);
  const setPrio = useCallback((id) => setPrioId((prev) => { const nx = prev === id ? null : id; store.set(KEYS.prio, JSON.stringify(nx ? [nx] : [])); return nx; }), []);
  const logBody = useCallback(() => {
    const w = parseFloat(bwDraft.replace(",", ".")), wa = parseFloat(waistDraft.replace(",", "."));
    if (!(w > 0) && !(wa > 0)) return;
    const entry = { ts: Date.now() };
    if (w > 0) entry.w = w;
    if (wa > 0) entry.waist = wa;
    setBody((prev) => { const n = [entry, ...prev].slice(0, 500); store.set(KEYS.body, JSON.stringify(n)); return n; });
    setBwDraft(""); setWaistDraft("");
  }, [bwDraft, waistDraft]);
  const saveHeight = useCallback((v) => { setHeightCm(v); store.set(KEYS.height, v); }, []);
  const deleteSession = useCallback((id) => { setHistory((h) => h.filter((x) => x.id !== id)); setOpenSession((o) => (o === id ? null : o)); }, []);
  const deleteBody = useCallback((ts) => setBody((prev) => { const n = prev.filter((b) => b.ts !== ts); store.set(KEYS.body, JSON.stringify(n)); return n; }), []);

  if (loading) return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg, color: C.dim }}><span className="font-mono text-sm">loading…</span></div>);

  const lastSession = history[0];
  const coverage = workout ? Math.round(100 * (1 - vsum(workout.finalState.remainingDemand) / Math.max(1, vsum(cfg.mev)))) : 0;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: C.bg, color: C.text }}>
      <style>{`@media (prefers-reduced-motion: reduce){*{transition:none!important}}`}</style>
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">

        {view === "home" && (<>
          <div className="mb-6">
            <div className="font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>Adaptive daily training</div>
            <div className="text-2xl font-semibold tracking-tight leading-none mt-1">Trning</div>
          </div>
          {DB_PROBLEMS.length > 0 && (
            <div className="mb-3 flex items-start gap-2 text-xs font-mono px-3 py-2 rounded-xl" style={{ color: C.warn, border: "1px solid " + C.warn + "55" }}>
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>{DB_PROBLEMS.length} dataset problem{DB_PROBLEMS.length > 1 ? "s" : ""} — open the console for details.</span>
            </div>
          )}
          <button onClick={() => setView("form")} className="w-full py-4 rounded-2xl font-mono text-sm font-semibold uppercase tracking-wide focus:outline-none" style={{ backgroundColor: accent + "1F", color: accent, border: "1px solid " + accent + "55" }}>
            Generate workout
          </button>
          {saved && <div className="mt-3 text-center font-mono text-sm" style={{ color: "#7FB48A" }}>✓ Logged to history</div>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setView("prio")} className="flex items-center justify-between px-4 py-3.5 rounded-2xl focus:outline-none" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
              <span className="font-mono text-xs uppercase tracking-wider truncate" style={{ color: C.dim }}>Priorities{prioId ? " · 1" : ""}</span>
              <span className="font-mono text-sm" style={{ color: C.dim }}>→</span>
            </button>
            <button onClick={() => { setOpenSession(null); setView("history"); }} className="flex items-center justify-between px-4 py-3.5 rounded-2xl focus:outline-none" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
              <span className="font-mono text-xs uppercase tracking-wider truncate" style={{ color: C.dim }}>History{history.length ? " · " + history.length : ""}</span>
              <Calendar size={14} style={{ color: C.dim }} />
            </button>
          </div>
          {prioId && (() => {
            const ex = EX_BY_ID[prioId];
            const pts = goalSeries(history, prioId);
            const useE1 = pts.some((p) => p.e1 > 0);
            const vals = pts.map((p) => (useE1 ? p.e1 : p.reps)).filter((v) => v > 0);
            const last = vals[vals.length - 1], prev = vals[vals.length - 2], best = vals.length ? Math.max(...vals) : 0;
            return (
              <Section title={"Goal lift · " + ex.name} note={pts.length ? pts.length + " logged" : "no data yet"} open={openCat === "__goal"} onToggle={() => setOpenCat(openCat === "__goal" ? null : "__goal")}>
                {vals.length ? (
                  <div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs" style={{ color: C.dim }}>{useE1 ? "e1RM" : "best reps"}</div>
                        <div className="text-xl font-semibold" style={{ color: accent }}>{useE1 ? last.toFixed(1) : last}
                          {prev ? <span className="text-sm ml-2" style={{ color: last >= prev ? "#7FB48A" : C.warn }}>{last >= prev ? "+" : ""}{useE1 ? (last - prev).toFixed(1) : last - prev}</span> : null}
                        </div>
                        <div className="font-mono text-xs mt-0.5" style={{ color: C.dim }}>best {useE1 ? best.toFixed(1) : best} · {fmtDate(pts[pts.length - 1].ts)}</div>
                      </div>
                      <Spark values={vals.slice(-12)} color={accent} />
                    </div>
                    <div className="mt-3 space-y-1">
                      {pts.slice(-4).reverse().map((p, i) => (
                        <div key={i} className="flex items-center justify-between font-mono text-xs py-1 px-2 rounded-md" style={{ backgroundColor: C.surface2, color: C.muted }}>
                          <span>{fmtDate(p.ts)}</span><span>{setSummary(p.sets)}{p.e1 > 0 ? " · " + p.e1.toFixed(1) : ""}</span>
                        </div>
                      ))}
                    </div>
                    {vals.length >= 2 && (
                      <button onClick={() => setView("goalchart")} className="mt-3 w-full py-2.5 rounded-xl font-mono text-xs uppercase tracking-wide focus:outline-none" style={{ backgroundColor: accent + "14", color: accent, border: "1px solid " + accent + "44" }}>
                        Full chart →
                      </button>
                    )}
                  </div>
                ) : (<div className="font-mono text-xs" style={{ color: C.dim }}>No sets logged for this lift yet — it'll come up often now; log it in a session and the trend appears here.</div>)}
              </Section>
            );
          })()}

          {(() => {
            const lw = body.find((b) => b.w), lwa = body.find((b) => b.waist);
            const hM = parseFloat(heightCm) / 100;
            const bmi = lw && hM > 0 ? lw.w / (hM * hM) : null;
            const wSeries = body.filter((b) => b.w).map((b) => b.w).reverse();
            const waSeries = body.filter((b) => b.waist).map((b) => b.waist).reverse();
            const inp = { width: 64, textAlign: "center", backgroundColor: C.surface2, border: "1px solid " + C.border, color: C.text, borderRadius: 6, padding: "5px 2px", fontSize: 13 };
            const note = lw ? lw.w + " kg" + (bmi ? " · BMI " + bmi.toFixed(1) : "") : "not tracked yet";
            return (
              <Section title="Body" note={note} open={openCat === "__body"} onToggle={() => setOpenCat(openCat === "__body" ? null : "__body")}>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[["Weight", lw ? lw.w + " kg" : "—", lw ? fmtDate(lw.ts) : ""], ["Waist", lwa ? lwa.waist + " cm" : "—", lwa ? fmtDate(lwa.ts) : ""], ["BMI", bmi ? bmi.toFixed(1) : "—", bmi ? "" : "needs height"]].map(([t, v, d]) => (
                    <div key={t} className="rounded-xl px-2.5 py-2" style={{ backgroundColor: C.surface2, border: "1px solid " + C.border }}>
                      <div className="font-mono text-xs" style={{ color: C.dim }}>{t}</div>
                      <div className="text-sm font-semibold mt-0.5">{v}</div>
                      {d ? <div className="font-mono text-xs mt-0.5" style={{ color: C.dim, opacity: 0.8 }}>{d}</div> : null}
                    </div>
                  ))}
                </div>
                {(wSeries.length >= 2 || waSeries.length >= 2) && (
                  <div className="flex items-center gap-4 mb-3">
                    {wSeries.length >= 2 && <div><div className="font-mono text-xs mb-0.5" style={{ color: C.dim }}>weight</div><Spark values={wSeries.slice(-16)} color={accent} /></div>}
                    {waSeries.length >= 2 && <div><div className="font-mono text-xs mb-0.5" style={{ color: C.dim }}>waist</div><Spark values={waSeries.slice(-16)} color={C.muted} /></div>}
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <input inputMode="decimal" value={bwDraft} placeholder="kg" onChange={(e) => setBwDraft(e.target.value)} style={inp} />
                  <input inputMode="decimal" value={waistDraft} placeholder="waist cm" onChange={(e) => setWaistDraft(e.target.value)} style={{ ...inp, width: 76 }} />
                  <button onClick={logBody} className="py-1.5 px-3 rounded-lg font-mono text-xs font-semibold uppercase focus:outline-none" style={{ backgroundColor: accent + "1F", color: accent, border: "1px solid " + accent + "55" }}>Log</button>
                  <span className="font-mono text-xs ml-auto" style={{ color: C.dim }}>height</span>
                  <input inputMode="numeric" value={heightCm} placeholder="cm" onChange={(e) => saveHeight(e.target.value.replace(",", "."))} style={{ ...inp, width: 52 }} />
                </div>
                <div className="mt-2 font-mono text-xs" style={{ color: C.dim }}>Log either or both. BMI = weight / height² from your latest weight.</div>
                {(wSeries.length >= 2 || waSeries.length >= 2) && (
                  <button onClick={() => setView("bodychart")} className="mt-3 w-full py-2.5 rounded-xl font-mono text-xs uppercase tracking-wide focus:outline-none" style={{ backgroundColor: accent + "14", color: accent, border: "1px solid " + accent + "44" }}>
                    Full charts →
                  </button>
                )}
              </Section>
            );
          })()}

          <Section title="Last workout" note={lastSession ? fmtDate(lastSession.ts) : "nothing yet"} open={!!lastSession && view === "home" && openCat === "__last"} onToggle={() => setOpenCat(openCat === "__last" ? null : "__last")}>
            {lastSession ? (
              <div className="space-y-2">
                {lastSession.entries.map((en, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl" style={{ backgroundColor: C.surface2, border: "1px solid " + C.border }}>
                    <div className="min-w-0"><span className="font-mono text-sm mr-2" style={{ color: C.dim }}>{i + 1}</span><span className="text-sm font-semibold">{en.name}</span></div>
                    <span className="font-mono text-xs shrink-0" style={{ color: en.sets.length ? accent : C.dim }}>{en.sets.length ? setSummary(en.sets) : "—"}</span>
                  </div>
                ))}
              </div>
            ) : (<div className="font-mono text-xs" style={{ color: C.dim }}>Nothing logged yet — generate a workout and tap Done.</div>)}
            {hotChips.length > 0 && (<div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="font-mono text-xs mr-1" style={{ color: C.dim }}>still recovering:</span>{hotChips.map((s) => <Chip key={s}>{s}</Chip>)}</div>)}
          </Section>
          <div className="mt-8 font-mono text-xs leading-relaxed" style={{ color: C.dim }}>
            Each exercise is a specific, loggable lift. Sessions are built greedily from muscle, joint and movement-pattern vectors — weighted by what still needs work, what's sore, what you just did, and your gear — then logged to history by date.
          </div>
        </>)}

        {view === "history" && (<>
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {openSession && <button onClick={() => setOpenSession(null)} aria-label="Back" className="p-1.5 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><ChevronLeft size={16} /></button>}
              <div className="text-2xl font-semibold tracking-tight leading-none">{openSession ? "Session" : "History"}</div>
            </div>
            <button onClick={() => setView("home")} aria-label="Close" className="p-2 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
          </div>

          {!history.length && (<div className="font-mono text-xs" style={{ color: C.dim }}>No sessions yet. Generate a workout, log your sets, and tap Done — it'll appear here by date.</div>)}
          {!openSession && history.length > 0 && (<div className="font-mono text-xs mb-3" style={{ color: C.dim }}>Tap a session for details · swipe left to delete.</div>)}

          {!openSession && history.length > 0 && (() => {
            const groups = [];
            /* hint rendered below */
            history.forEach((h) => {
              const d = dayStamp(h.ts);
              if (!groups.length || groups[groups.length - 1].d !== d) groups.push({ d, ts: h.ts, items: [] });
              groups[groups.length - 1].items.push(h);
            });
            return (
              <div className="space-y-4">
                {groups.map((g) => (
                  <div key={g.d}>
                    <div className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: C.dim }}>{fmtDate(g.ts)}</div>
                    <div className="space-y-2">
                      {g.items.map((h) => {
                        const logged = h.entries.filter((en) => en.sets.length).length;
                        return (
                          <SwipeRow key={h.id} onDelete={() => deleteSession(h.id)} onClick={() => { setConfirmDel(false); setOpenSession(h.id); }}>
                            <div className="w-full text-left rounded-2xl overflow-hidden" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
                              <div style={{ height: 2, backgroundColor: accent }} />
                              <div className="px-4 py-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-mono text-xs uppercase tracking-wider" style={{ color: accent }}>{fmtTime(h.ts)} · {(FOCUS.find((f) => f.key === h.focus) || FOCUS[1]).label}</span>
                                  <span className="font-mono text-xs" style={{ color: C.dim }}>{h.entries.length} lifts{logged ? " · " + logged + " logged" : ""}</span>
                                </div>
                                <div className="text-sm truncate" style={{ color: C.text }}>{h.entries.map((en) => en.name).join(" · ")}</div>
                              </div>
                            </div>
                          </SwipeRow>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {openSession && (() => {
            const h = history.find((x) => x.id === openSession);
            if (!h) return null;
            return (
              <div>
                <div className="font-mono text-xs uppercase tracking-wider mb-1" style={{ color: C.dim }}>{fmtDate(h.ts)} · {fmtTime(h.ts)}</div>
                <div className="font-mono text-xs mb-4" style={{ color: C.dim }}>{(FOCUS.find((f) => f.key === h.focus) || FOCUS[1]).label} · {h.readiness}</div>
                <div className="space-y-2">
                  {h.entries.map((en, i) => {
                    const be = bestE1rm(en.sets);
                    return (
                      <div key={i} className="rounded-xl px-3 py-2.5" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">{en.name}</div>
                          {be > 0 && <span className="font-mono text-xs" style={{ color: accent }}>e1RM {be.toFixed(1)}</span>}
                        </div>
                        <div className="font-mono text-xs mt-1" style={{ color: en.sets.length ? C.muted : C.dim }}>
                          {en.sets.length ? en.sets.map((sx, k) => (sx.w ? sx.w + "kg × " : "") + (sx.r || "–") + (sx.rpe ? " @" + sx.rpe : "")).join("   ") : "not logged"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); return; } deleteSession(h.id); }} className="mt-4 w-full py-3 rounded-xl font-mono text-xs font-semibold uppercase tracking-wide focus:outline-none" style={{ minHeight: 44, backgroundColor: confirmDel ? C.warn + "26" : "transparent", color: C.warn, border: "1px solid " + C.warn + "55" }}>
                  {confirmDel ? "Tap again to delete permanently" : "Delete this session"}
                </button>
              </div>
            );
          })()}
        </>)}

        {view === "goalchart" && prioId && (() => {
          const ex = EX_BY_ID[prioId];
          const pts = goalSeries(history, prioId);
          const useE1 = pts.some((p) => p.e1 > 0);
          const series = pts.map((p) => ({ ts: p.ts, v: useE1 ? p.e1 : p.reps })).filter((p) => p.v > 0);
          return (<>
            <div className="mb-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>Goal lift · {useE1 ? "e1RM, kg" : "best reps"}</div>
                <div className="text-2xl font-semibold tracking-tight leading-none mt-1 truncate">{ex.name}</div>
              </div>
              <button onClick={() => setView("home")} aria-label="Close" className="p-2 rounded-lg shrink-0 focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
            </div>
            <div className="rounded-2xl p-3" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
              <BigChart points={series} color={accent} unit={useE1 ? "kg" : "reps"} />
            </div>
            <div className="mt-4 space-y-1.5">
              {[...pts].reverse().map((p, i) => (
                <div key={i} className="flex items-center justify-between font-mono text-xs py-1.5 px-3 rounded-lg" style={{ backgroundColor: C.surface, border: "1px solid " + C.border, color: C.muted }}>
                  <span>{fmtDate(p.ts)}</span><span>{setSummary(p.sets)}{p.e1 > 0 ? " · e1RM " + p.e1.toFixed(1) : ""}</span>
                </div>
              ))}
            </div>
          </>);
        })()}

        {view === "bodychart" && (() => {
          const wPts = body.filter((b) => b.w).map((b) => ({ ts: b.ts, v: b.w })).reverse();
          const waPts = body.filter((b) => b.waist).map((b) => ({ ts: b.ts, v: b.waist })).reverse();
          const hM = parseFloat(heightCm) / 100;
          const bmiPts = hM > 0 ? wPts.map((p) => ({ ts: p.ts, v: p.v / (hM * hM) })) : [];
          return (<>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-2xl font-semibold tracking-tight leading-none">Body</div>
              <button onClick={() => setView("home")} aria-label="Close" className="p-2 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
            </div>
            <div className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: C.dim }}>Weight · kg</div>
            <div className="rounded-2xl p-3" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
              <BigChart points={wPts} color={accent} unit="kg" />
            </div>
            <div className="font-mono text-xs uppercase tracking-wider mb-2 mt-5" style={{ color: C.dim }}>Waist · cm</div>
            <div className="rounded-2xl p-3" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
              <BigChart points={waPts} color="#F5B14C" unit="cm" />
            </div>
            {bmiPts.length >= 2 && (<>
              <div className="font-mono text-xs uppercase tracking-wider mb-2 mt-5" style={{ color: C.dim }}>BMI</div>
              <div className="rounded-2xl p-3" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
                <BigChart points={bmiPts} color={C.muted} unit="" />
              </div>
            </>)}
            {body.length > 0 && (<>
              <div className="font-mono text-xs uppercase tracking-wider mb-2 mt-5" style={{ color: C.dim }}>Entries · swipe left to delete</div>
              <div className="space-y-1.5">
                {body.map((b) => (
                  <SwipeRow key={b.ts} onDelete={() => deleteBody(b.ts)} radius={12}>
                    <div className="flex items-center justify-between font-mono text-xs py-3 px-3 rounded-xl" style={{ minHeight: 44, backgroundColor: C.surface, border: "1px solid " + C.border, color: C.muted }}>
                      <span>{fmtDate(b.ts)}</span>
                      <span>{[b.w ? b.w + " kg" : null, b.waist ? b.waist + " cm" : null].filter(Boolean).join(" · ")}</span>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            </>)}
          </>);
        })()}

        {view === "prio" && (<>
          <div className="mb-5 flex items-center justify-between">
            <div className="text-2xl font-semibold tracking-tight leading-none">Priorities</div>
            <button onClick={() => setView("home")} aria-label="Close" className="p-2 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
          </div>
          <div className="mb-2 font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>Focus</div>
          <div className="flex gap-2">
            {FOCUS.map((f) => (
              <button key={f.key} onClick={() => { setFocus(f.key); store.set(KEYS.focus, f.key); }} className="flex-1 py-3 rounded-xl font-mono text-xs uppercase tracking-wide transition focus:outline-none"
                style={{ backgroundColor: focus === f.key ? accent + "1F" : C.surface2, color: focus === f.key ? accent : C.muted, border: "1px solid " + (focus === f.key ? accent + "66" : C.border) }}>{f.label}</button>
            ))}
          </div>
          <div className="mt-2 font-mono text-xs leading-relaxed" style={{ color: C.dim }}>
            {focus === "strength" ? "Demand loaded onto the main patterns (hinge, squat, push, pull); core and conditioning appear when overdue." : focus === "conditioning" ? "Demand loaded onto GPP and core; main lifts still appear where muscle demand is high, but less often." : "Even demand across all patterns — coverage guaranteed over time."}
          </div>
          <div className="mt-6 mb-2 font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>Goal lift{prioId ? " · " + EX_BY_ID[prioId].name : ""}</div>
          <div className="space-y-2">
            {DS_CATS.map((dc) => {
              const list = EXDB.filter((e) => e.category === dc);
              const nSel = list.some((e) => e.id === prioId) ? 1 : 0;
              const isOpen = openCat === dc;
              return (
                <div key={dc} className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
                  <button onClick={() => setOpenCat(isOpen ? null : dc)} className="w-full flex items-center justify-between px-4 py-3 focus:outline-none">
                    <span className="font-mono text-xs uppercase tracking-wider" style={{ color: nSel ? accent : C.dim }}>{dc}{nSel ? " · " + nSel : ""}</span>
                    <span className="font-mono text-sm" style={{ color: C.dim }}>{isOpen ? "–" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 flex flex-wrap gap-2">
                      {list.map((e) => (<Toggle key={e.id} active={prioId === e.id} color={C.accent} onClick={() => setPrio(e.id)}>{e.name}</Toggle>))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 font-mono text-xs" style={{ color: C.dim }}>One goal lift at a time — it scores {BASE_CONFIG.priorityMultiplier}× higher, comes up much more often, and its progress is tracked on the home screen. Tap again to clear. Recovery, soreness and equipment still apply.</div>
        </>)}

        {view === "gear" && (<>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-2xl font-semibold tracking-tight leading-none">Equipment & environment</div>
            <button onClick={() => setView("form")} aria-label="Back" className="p-2 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
          </div>
          <div className="mb-4 font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>What's available today? · saved between sessions</div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2" style={{ color: C.dim }}>Environment</div>
          <div className="flex flex-wrap gap-2">{ENVS.map((e) => (<Toggle key={e.key} active={!!equipment[e.key]} color={C.accent} onClick={() => toggleEq(e.key)}>{e.label}</Toggle>))}</div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2 mt-5" style={{ color: C.dim }}>Equipment</div>
          <div className="flex flex-wrap gap-2">{EQUIP.map((e) => (<Toggle key={e.key} active={!!equipment[e.key]} color={C.accent} onClick={() => toggleEq(e.key)}>{e.label}</Toggle>))}</div>
          <div className="mt-3 font-mono text-xs" style={{ color: C.dim }}>An exercise is offered only if its required gear is present, at least one alternative is present, and one of its environments is available.</div>
          <button onClick={() => setView("form")} className="mt-5 w-full py-4 rounded-2xl font-mono text-sm font-semibold uppercase tracking-wide focus:outline-none" style={{ backgroundColor: accent + "1F", color: accent, border: "1px solid " + accent + "55" }}>
            Back to check-in
          </button>
        </>)}

        {view === "form" && (<>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-2xl font-semibold tracking-tight leading-none">Today's form</div>
            <button onClick={() => setView("home")} aria-label="Back" className="p-2 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
          </div>
          <div className="mb-3 font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>Daily check-in · how are you feeling?</div>
          <button onClick={() => setView("gear")} className="mb-4 w-full flex items-center justify-between px-4 py-3 rounded-2xl focus:outline-none" style={{ minHeight: 44, backgroundColor: C.surface, border: "1px solid " + C.border }}>
            <span className="font-mono text-xs truncate" style={{ color: C.dim }}>Gear: {EQUIP.filter((q) => equipment[q.key]).map((q) => q.label).join(", ") || "bodyweight only"}</span>
            <span className="font-mono text-xs shrink-0 ml-2" style={{ color: accent }}>change</span>
          </button>
          <div className="mb-3 font-mono text-xs uppercase tracking-wider" style={{ color: C.dim }}>How fresh are you today?</div>
          <div className="flex gap-2 mb-2">
            {READINESS.map((r) => (
              <button key={r.key} onClick={() => setReadiness(r.key)} className="flex-1 py-3 rounded-xl font-mono text-sm uppercase tracking-wide transition focus:outline-none"
                style={{ backgroundColor: readiness === r.key ? r.color + "1F" : C.surface2, color: readiness === r.key ? r.color : C.muted, border: "1px solid " + (readiness === r.key ? r.color + "66" : C.border) }}>{r.label}</button>
            ))}
          </div>
          <div className="font-mono text-xs" style={{ color: C.dim }}>Readiness sets session length ({READY_CFG[readiness].workoutSize} movements), how technical the picks may be, and how hard high-fatigue lifts are penalized.</div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2 mt-4" style={{ color: C.dim }}>Sore muscles</div>
          <div className="flex flex-wrap gap-2">{MUSCLE_LABELS.map((l, i) => (<Toggle key={l} active={!!soreM[i]} color={C.warn} onClick={() => toggleSoreM(i)}>{l}</Toggle>))}</div>
          <div className="font-mono text-xs uppercase tracking-wider mb-2 mt-4" style={{ color: C.dim }}>Sore joints</div>
          <div className="flex flex-wrap gap-2">{JOINT_LABELS.map((l, j) => (<Toggle key={l} active={!!soreJ[j]} color={C.warn} onClick={() => toggleSoreJ(j)}>{l}</Toggle>))}</div>
          <div className="mt-3 font-mono text-xs" style={{ color: C.dim }}>Exercises that load a flagged area significantly are excluded; light incidental loading is scored down instead.</div>
          <button onClick={generate} className="mt-5 w-full py-4 rounded-2xl font-mono text-sm font-semibold uppercase tracking-wide focus:outline-none" style={{ backgroundColor: accent + "1F", color: accent, border: "1px solid " + accent + "55" }}>
            Generate
          </button>
        </>)}

        {view === "session" && workout && (<>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-2xl font-semibold tracking-tight leading-none">Today's session</div>
            <button onClick={() => setView("form")} aria-label="Back" className="p-2 rounded-lg focus:outline-none" style={{ color: C.dim, border: "1px solid " + C.border }}><X size={17} /></button>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: C.surface, border: "1px solid " + C.border }}>
            <div style={{ height: 3, backgroundColor: workout.exercises.length ? accent : C.warn }} />
            {workout.exercises.length === 0 ? (
              <div className="p-5">
                <div className="flex items-start gap-2 text-sm" style={{ color: C.text }}>
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" style={{ color: C.warn }} />
                  <span>Nothing passes today's filters — between what's flagged sore and the available gear, no exercise is safe to program.</span>
                </div>
                <div className="mt-3 font-mono text-xs leading-relaxed" style={{ color: C.dim }}>
                  If most of your body is flagged, treat it as a rest day — that's the right call, not a failure. Otherwise, unflag what's recovered or add equipment and try again.
                </div>
                <button onClick={() => setView("form")} className="mt-4 w-full py-3.5 rounded-xl font-mono text-sm font-semibold uppercase tracking-wide focus:outline-none" style={{ backgroundColor: accent + "1F", color: accent, border: "1px solid " + accent + "55" }}>
                  Back to today's form
                </button>
              </div>
            ) : (
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs uppercase tracking-wider" style={{ color: accent }}>{(FOCUS.find((f) => f.key === focus) || FOCUS[1]).label} · {readiness}</span>
                <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ color: C.text, backgroundColor: C.surface2, border: "1px solid " + C.border }}>{coverage}% of target · {workout.finalState.fatigue < 15 ? "light" : workout.finalState.fatigue < 22 ? "moderate" : "heavy"}</span>
              </div>
              <div className="font-mono text-xs mb-3" style={{ color: C.dim }}>Warm-up: ramp the first movement with lighter sets — no static stretching. Tap “log” under any lift to record sets.</div>
              <div className="space-y-2">
                {workout.exercises.map((e, i) => (
                  <div key={e.id}>
                    <div className="py-2.5 px-3 rounded-xl" style={{ backgroundColor: C.surface2, border: "1px solid " + C.border }}>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm w-4 shrink-0" style={{ color: C.dim }}>{i + 1}</span>
                        <div className="flex-1 min-w-0 text-sm font-semibold leading-snug">{e.name}{prioId === e.id ? <span style={{ color: accent }}> ↑</span> : null}</div>
                        <button onClick={() => doSwap(i)} aria-label={"Swap " + e.name} className="rounded-md shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2" style={{ minWidth: 44, minHeight: 44, color: C.dim, border: "1px solid " + C.border, backgroundColor: "transparent" }}><ArrowLeftRight size={15} /></button>
                      </div>
                      <div className="mt-1.5 pl-7 flex items-center justify-between gap-2">
                        <span className="font-mono text-xs" style={{ color: C.dim }}>{e.category}</span>
                        <span className="font-mono text-xs px-2 py-1 rounded-md shrink-0" style={{ color: accent, backgroundColor: accent + "14", border: "1px solid " + accent + "44" }}>{(FMTS[readiness] || FMTS.ok)[kindOf(e)]}</span>
                      </div>
                    </div>
                    <Logger ex={e} history={history} draft={draft} setDraftVal={setDraftVal} readiness={readiness} accent={accent} />
                  </div>
                ))}
              </div>
              {workout.exercises.length < cfg.workoutSize && (
                <div className="mt-3 font-mono text-xs" style={{ color: C.dim }}>Stopped at {workout.exercises.length} — nothing left in the pool adds more value than it costs today.</div>
              )}
              <div className="mt-2 font-mono text-xs" style={{ color: (READINESS.find((r) => r.key === readiness) || READINESS[1]).color }}>{RPE_LINE[readiness]}</div>
              {blockedLabels.length > 0 && (<div className="mt-3 flex items-start gap-2 text-xs font-mono" style={{ color: C.warn }}><TriangleAlert size={13} className="mt-0.5 shrink-0" /><span>Avoiding {blockedLabels.join(", ")}.</span></div>)}
            </div>
            )}
            {workout.exercises.length > 0 && (
            <div className="flex gap-px" style={{ backgroundColor: C.border }}>
              <button onClick={reshuffle} className="flex-1 flex items-center justify-center gap-2 py-4 font-mono text-sm" style={{ backgroundColor: confirmShuffle ? C.warn + "1F" : C.surface, color: confirmShuffle ? C.warn : C.muted }}><RefreshCw size={15} /> {confirmShuffle ? "Discard logged sets?" : "Shuffle"}</button>
              <button onClick={done} className="flex-1 flex items-center justify-center gap-2 py-4 font-mono text-sm font-semibold" style={{ backgroundColor: accent + "1F", color: accent }}><Check size={15} /> Done</button>
            </div>
            )}
          </div>
        </>)}

      </div>
    </div>
  );
}
