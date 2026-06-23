"use client";

import { useEffect, useRef, useState } from "react";

type SignaturePadProps = {
  signerName: string;
  value: string;
  onChange: (signatureDataUrl: string) => void;
  onSignerNameChange: (name: string) => void;
  signerLabel?: string;
  signerPlaceholder?: string;
  helpText?: string;
  ariaLabel?: string;
  emptyMessage?: string;
};

type Point = {
  x: number;
  y: number;
};

function canvasPoint(canvas: HTMLCanvasElement, event: React.PointerEvent) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function SignaturePad({
  signerName,
  value,
  onChange,
  onSignerNameChange,
  signerLabel = "Client signer name",
  signerPlaceholder = "Client full name",
  helpText = "Use the sales iPad in landscape mode for the cleanest signature.",
  ariaLabel = "Digital signature pad",
  emptyMessage = "Ask the signer to sign inside the box.",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * pixelRatio);
    canvas.height = Math.floor(rect.height * pixelRatio);

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.scale(pixelRatio, pixelRatio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.4;
    context.strokeStyle = "#0f172a";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);

    if (value) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = value;
    }
  }, [value]);

  function commitSignature() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    onChange(canvas.toDataURL("image/png"));
  }

  function beginDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    lastPointRef.current = canvasPoint(canvas, event);
    setIsDrawing(true);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const previousPoint = lastPointRef.current;

    if (!canvas || !isDrawing || !previousPoint) {
      return;
    }

    event.preventDefault();
    const nextPoint = canvasPoint(canvas, event);
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
  }

  function endDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) {
      return;
    }

    event.preventDefault();
    setIsDrawing(false);
    lastPointRef.current = null;
    commitSignature();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    onChange("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
      <label>
        <span className="text-sm font-bold text-muted-strong">
          {signerLabel}
        </span>
        <input
          value={signerName}
          onChange={(event) => onSignerNameChange(event.target.value)}
          placeholder={signerPlaceholder}
          className="mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
        />
        <p className="mt-2 text-xs font-semibold leading-5 text-muted">
          {helpText}
        </p>
      </label>

      <div>
        <div className="rounded-lg border border-material-outline-variant bg-white p-2 shadow-[var(--md-elevation-1)]">
          <canvas
            ref={canvasRef}
            aria-label={ariaLabel}
            className="h-44 w-full touch-none rounded-md bg-white"
            onPointerDown={beginDrawing}
            onPointerMove={draw}
            onPointerUp={endDrawing}
            onPointerCancel={endDrawing}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted">
            {value ? "Signature captured" : emptyMessage}
          </p>
          <button
            type="button"
            onClick={clearSignature}
            className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong"
          >
            Clear signature
          </button>
        </div>
      </div>
    </div>
  );
}
