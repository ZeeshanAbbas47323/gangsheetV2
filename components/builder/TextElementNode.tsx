"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Text as KonvaText } from "react-konva";
import { fontStack } from "@/lib/text";
import type { TextElement } from "@/lib/types";

const PT_PER_IN = 72;

interface Props {
  element: TextElement;
  onSelect: (e: KonvaEventObject<MouseEvent | Event>, id: string) => void;
  onDragStart: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onTransformEnd: (node: Konva.Node, id: string) => void;
}

/** Renders a text element on the inch-scaled Konva stage. */
export default function TextElementNode({
  element: el,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: Props) {
  if (!el.visible) return null;

  // font size is in points; stage units are inches → divide by 72
  const fontSizeIn = el.fontSize / PT_PER_IN;
  const fontStyle = `${el.italic ? "italic " : ""}${el.fontWeight}`;

  return (
    <KonvaText
      id={el.id}
      name="element"
      text={el.text}
      x={el.x}
      y={el.y}
      width={el.widthIn}
      offsetX={el.widthIn / 2}
      offsetY={el.heightIn / 2}
      scaleX={el.flipX ? -1 : 1}
      scaleY={el.flipY ? -1 : 1}
      rotation={el.rotation}
      opacity={el.opacity}
      fontFamily={fontStack(el.fontFamily)}
      fontSize={fontSizeIn}
      fontStyle={fontStyle}
      align={el.align}
      lineHeight={el.lineHeight}
      letterSpacing={el.letterSpacing / PT_PER_IN}
      fill={el.color}
      stroke={el.outlineWidth > 0 ? el.outlineColor : undefined}
      strokeWidth={el.outlineWidth > 0 ? el.outlineWidth / PT_PER_IN : 0}
      fillAfterStrokeEnabled
      textDecoration={el.underline ? "underline" : ""}
      draggable={!el.locked}
      onClick={(e) => onSelect(e, el.id)}
      onTap={(e) => onSelect(e, el.id)}
      onDragStart={(e) => onDragStart(e, el.id)}
      onDragMove={(e) => onDragMove(e, el.id)}
      onDragEnd={(e) => onDragEnd(e, el.id)}
      onTransformEnd={(e) => onTransformEnd(e.target, el.id)}
    />
  );
}
