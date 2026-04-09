function FeatureCard({ title, text, image }) {
  return (
    <article className="glass-card floating-card overflow-hidden p-3">
      <img src={image} alt={title} className="h-44 w-full rounded-[24px] object-cover" />
      <div className="p-3">
        <h3 className="font-heading text-2xl text-primary">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-slate-600">{text}</p>
      </div>
    </article>
  );
}

export default FeatureCard;
