"use client";

import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import type { CanvasElement, LibraryAsset } from "@/lib/types";

interface Props {
  element: CanvasElement;
  asset: LibraryAsset | undefined;
  onSelect: (e: KonvaEventObject<MouseEvent | Event>, id: string) => void;
  onDragStart: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onDragMove: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>, id: string) => void;
  onTransformEnd: (node: Konva.Node, id: string) => void;
}

export default function CanvasElementNode({
  element: el,
  asset,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: Props) {
  const [image] = useImage(asset?.src ?? "", "anonymous");

  if (!el.visible || !asset) return null;

  return (
    <KonvaImage
      id={el.id}
      name="element"
      image={image}
      x={el.x}
      y={el.y}
      width={el.widthIn}
      height={el.heightIn}
      offsetX={el.widthIn / 2}
      offsetY={el.heightIn / 2}
      scaleX={el.flipX ? -1 : 1}
      scaleY={el.flipY ? -1 : 1}
      rotation={el.rotation}
      opacity={el.opacity}
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
