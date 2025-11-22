// // frontend/src/components/AnimatedContent.jsx

// frontend/src/components/AnimatedContent.jsx
import { useRef, useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const AnimatedContent = ({
  children,
  distance = 100,
  direction = "vertical",
  reverse = false,
  duration = 0.8,
  ease = "power3.out",
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  onComplete,
  triggerOnScroll = true, // new prop to toggle scroll trigger
}) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const axis = direction === "horizontal" ? "x" : "y";
    const offset = reverse ? -distance : distance;
    const startPct = (1 - threshold) * 100;

    // Set initial state
    gsap.set(el, {
      [axis]: offset,
      scale,
      opacity: animateOpacity ? initialOpacity : 1,
    });

    // Build animation config
    const animationConfig = {
      [axis]: 0,
      scale: 1,
      opacity: 1,
      duration,
      ease,
      delay,
      onComplete,
    };

    if (triggerOnScroll) {
      // Add scrollTrigger for scroll-based animation
      animationConfig.scrollTrigger = {
        trigger: el,
        start: `top ${startPct}%`,
        toggleActions: "play none none none",
        once: true,
      };
    }

    // Run the animation
    gsap.to(el, animationConfig);

    // Cleanup on unmount
    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
      gsap.killTweensOf(el);
    };
  }, [
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    threshold,
    delay,
    onComplete,
    triggerOnScroll,
  ]);

  return <div ref={ref}>{children}</div>;
};

export default AnimatedContent;