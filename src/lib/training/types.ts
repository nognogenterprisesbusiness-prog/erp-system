export type TrainingStep = {
  title: string;
  /** Seconds from the start of the lesson video. */
  time: number;
  image: string;
  text: string;
};

export type TrainingLesson = {
  slug: string;
  kind: "web" | "mobile";
  title: string;
  /** Google Drive file id; the video plays through Drive's /preview player. */
  driveId: string;
  minutes: number;
  summary: string;
  remember: string;
  steps: readonly TrainingStep[];
};
