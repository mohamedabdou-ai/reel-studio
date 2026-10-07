import React from "react";
import {
  RemotionBitsAnimatedNumber,
  RemotionBitsFrameReveal,
  type RemotionBitsAnimatedNumberProps,
} from "./vendor/remotion-bits";
import {
  RemotionUiDrawProgress,
  RemotionUiFocusCursor,
  RemotionUiMaskedBlockReveal,
  type RemotionUiMaskedBlockRevealProps,
} from "./vendor/remotion-ui";

export type FrameRevealProps = {
  children: React.ReactNode;
  frame: number;
  duration: number;
  distance?: number;
};

export const FrameReveal: React.FC<FrameRevealProps> = (props) => (
  <RemotionBitsFrameReveal {...props} />
);

export type DrawProgressProps = {
  progress: number;
  color: string;
  width: number;
  height: number;
};

export const DrawProgress: React.FC<DrawProgressProps> = (props) => (
  <RemotionUiDrawProgress {...props} />
);

export type FocusCursorProps = {

  x: number;

  y: number;

  progress: number;
  color: string;
};

export const FocusCursor: React.FC<FocusCursorProps> = (props) => (
  <RemotionUiFocusCursor {...props} />
);

export type AnimatedNumberProps = RemotionBitsAnimatedNumberProps;
export const AnimatedNumber = RemotionBitsAnimatedNumber;

export type MaskedBlockRevealProps = RemotionUiMaskedBlockRevealProps;
export const MaskedBlockReveal = RemotionUiMaskedBlockReveal;
