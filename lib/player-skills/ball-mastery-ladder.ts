export const BALL_MASTERY_LADDER_ID = "ball-mastery" as const;

export type BallMasteryLevel = {
  id: string;
  order: number;
  title: string;
  kidBrief: string;
  practicePrompt: string;
  youtubeQuery: string;
  relatedGoalId?: string;
};

/**
 * Kid-facing Ball Mastery ladder: footwork → retain under pressure.
 * Ordered so each level unlocks only after the previous is mastered.
 */
export const BALL_MASTERY_LEVELS: BallMasteryLevel[] = [
  {
    id: "bm-01-soft-touches",
    order: 1,
    title: "Soft touches, both feet",
    kidBrief:
      "Keep the ball close with soft taps. Switch feet so both feel natural.",
    practicePrompt:
      "Practice 2 minutes each foot: soft taps in place, then walking. Ball stays one step away.",
    youtubeQuery:
      "youth soccer ball mastery both feet soft touches beginners drill",
    relatedGoalId: "u12-control-across-surfaces",
  },
  {
    id: "bm-02-surfaces",
    order: 2,
    title: "Inside and outside while moving",
    kidBrief:
      "Use the inside and outside of each foot to move the ball without stopping.",
    practicePrompt:
      "Dribble in a small box using inside then outside on both feet. Keep the ball playable.",
    youtubeQuery:
      "youth soccer dribbling inside outside foot surfaces ball mastery U12",
    relatedGoalId: "u12-control-across-surfaces",
  },
  {
    id: "bm-03-sole-rolls",
    order: 3,
    title: "Sole rolls and pull-backs",
    kidBrief:
      "Roll the ball with the sole and pull it back to change direction.",
    practicePrompt:
      "Do 10 sole rolls each foot, then 10 pull-backs. Stay balanced and keep your head up.",
    youtubeQuery:
      "youth soccer sole roll pull back ball mastery beginners drill",
    relatedGoalId: "u12-control-across-surfaces",
  },
  {
    id: "bm-04-change-direction",
    order: 4,
    title: "Change direction with the ball",
    kidBrief: "Cut and turn so you can leave pressure behind.",
    practicePrompt:
      "Set two cones. Dribble, cut left, cut right. Exit touch takes you into space.",
    youtubeQuery:
      "youth soccer change of direction dribbling cut turn ball mastery U12",
    relatedGoalId: "u12-change-speed-direction",
  },
  {
    id: "bm-05-turn-escape",
    order: 5,
    title: "Turn to escape",
    kidBrief:
      "Sell one way, turn, then push the ball past the defender and accelerate.",
    practicePrompt:
      "Practice a turn, then take three fast steps with a long exit touch. Repeat both ways.",
    youtubeQuery:
      "youth soccer turn to escape pressure dribbling drill U12",
    relatedGoalId: "u12-change-speed-direction",
  },
  {
    id: "bm-06-shield",
    order: 6,
    title: "Shield and keep the ball",
    kidBrief:
      "Put your body between the ball and a defender. Move your feet — don’t freeze.",
    practicePrompt:
      "Side-on stance, far foot on the ball. Feel light pressure, keep the ball away, then exit or pass.",
    youtubeQuery:
      "youth soccer shielding protect ball retain possession drill U12",
    relatedGoalId: "u12-shield-and-retain",
  },
  {
    id: "bm-07-put-together",
    order: 7,
    title: "Put it together",
    kidBrief:
      "Combine soft touches, a turn, and a shield in one short free practice.",
    practicePrompt:
      "60 seconds: move with both feet, turn once, shield once, then escape into space. Do it three times.",
    youtubeQuery:
      "youth soccer ball mastery freestyle combination dribbling turns shield beginners",
    relatedGoalId: "u12-shield-and-retain",
  },
];

export function getBallMasteryLevel(levelId: string): BallMasteryLevel | undefined {
  return BALL_MASTERY_LEVELS.find((level) => level.id === levelId);
}

export function getNextBallMasteryLevel(
  levelId: string,
): BallMasteryLevel | undefined {
  const current = getBallMasteryLevel(levelId);
  if (!current) return undefined;
  return BALL_MASTERY_LEVELS.find((level) => level.order === current.order + 1);
}

export function ballMasteryLevelCount(): number {
  return BALL_MASTERY_LEVELS.length;
}
