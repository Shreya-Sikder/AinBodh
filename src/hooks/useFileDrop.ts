import { useCallback, useRef, useState } from "react";

export function useFileDrop(onFile: (file: File) => void) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const choose = useCallback(() => inputRef.current?.click(), []);
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );
  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return { inputRef, dragging, choose, onDragOver, onDragLeave, onDrop, onChange };
}

