import SmartImage from './SmartImage';
import { DEFAULT_IMAGES } from '../utils/defaultImages';

function FeatureCard({ title, text, image }) {
  return (
    <article className="glass-card floating-card overflow-hidden p-3">
      <SmartImage
        src={image}
        fallbackSrc={DEFAULT_IMAGES.classroom}
        alt={title}
        className="h-44 w-full rounded-[24px] object-cover"
        loading="lazy"
      />
      <div className="p-3">
        <h3 className="font-heading text-2xl text-primary">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-slate-600">{text}</p>
      </div>
    </article>
  );
}

export default FeatureCard;
