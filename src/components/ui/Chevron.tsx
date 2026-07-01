/** Chevron directionnel inline. API historique préservée (direction). */
export function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={direction === "left" ? "mr-1.5 inline-block align-middle" : "ml-1.5 inline-block align-middle"}
      aria-hidden="true"
    >
      {direction === "left" ? (
        <polyline points="9,2 4,7 9,12" />
      ) : (
        <polyline points="5,2 10,7 5,12" />
      )}
    </svg>
  );
}
