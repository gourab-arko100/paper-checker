export default function Loading() {
  return (
    <div className="stack" role="status" aria-label="Loading workspace">
      <div className="skeleton short" />
      <div className="metrics">
        {[0, 1, 2, 3].map((index) => (
          <div className="skeleton" key={index} />
        ))}
      </div>
      <div className="skeleton tall" />
    </div>
  );
}
