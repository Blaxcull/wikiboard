import { memo, useRef } from "react";

type Props = {
  title: string;
  preview: string;
  thumbnail: string | null;
  onWakeUp: () => void;
};

const FrozenPreview = memo(function FrozenPreview({
  title,
  preview,
  thumbnail,
  onWakeUp,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="frozen-preview"
      onMouseEnter={onWakeUp}
      onWheel={(e) => {
        e.preventDefault();
        onWakeUp();
      }}
    >
      <h2 className="frozen-title">{title.replace(/_/g, " ")}</h2>
      {thumbnail && (
        <img
          className="frozen-thumbnail"
          src={thumbnail}
          alt=""
          loading="lazy"
        />
      )}
      {preview && <p className="frozen-snippet">{preview}</p>}
      <div className="frozen-hint">Hover or scroll to load full article</div>
    </div>
  );
});

export default FrozenPreview;
