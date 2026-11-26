import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Bookmark,
  Search,
  LibraryBig,
  ShieldCheck,
  Sparkles,
  Clock3,
  Menu,
  X,
} from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Brand } from "../../components/ui/Common";

gsap.registerPlugin(ScrollTrigger);
export default function LandingPage() {
  const root = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.from(".hero-copy > *", {
        y: 24,
        opacity: 0,
        duration: 0.75,
        stagger: 0.12,
        ease: "power2.out",
      });
      gsap.from(".library-art", {
        y: 30,
        opacity: 0,
        duration: 1,
        delay: 0.25,
      });
      gsap.utils.toArray(".reveal-section").forEach((section) =>
        gsap.from(section, {
          y: 30,
          opacity: 0,
          duration: 0.7,
          scrollTrigger: { trigger: section, start: "top 87%", once: true },
        }),
      );
    }, root);
    return () => context.revert();
  }, []);
  return (
    <div className="landing" ref={root}>
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-header">
        <Link to="/" aria-label="Archthea home">
          <Brand />
        </Link>
        <nav aria-label="Website navigation">
          <a href="#experience">The experience</a>
          <a href="#collection">Our collection</a>
          <Link className="button primary small" to="/login">
            Enter your library
          </Link>
        </nav>
      </header>
      <main id="landing-main">
        <section className="landing-hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-line" /> A PLACE FOR CURIOUS MINDS
            </p>
            <h1>
              A little curiosity.
              <br />A whole new
              <br />
              <em>chapter.</em>
            </h1>
            <p>
              Your next great idea might be waiting on a shelf. Discover,
              borrow, and make space for a world of possibilities.
            </p>
            <div className="hero-actions">
              <Link className="button primary" to="/login">
                <BookOpen size={19} />
                Explore your library
              </Link>
              <a className="button quiet" href="#experience">
                Get to know Archthea
              </a>
            </div>
            <div className="hero-caption">
              <ShieldCheck size={17} />
              <span>Thoughtfully organized. Effortlessly connected.</span>
            </div>
          </div>
          <div
            className="library-art"
            role="img"
            aria-label="An illustrated collection of books beneath a sunlit library arch"
          >
            <div className="art-arch">
              <div className="art-sun" />
              <div className="art-window-line vertical" />
              <div className="art-window-line horizontal" />
              <div className="art-circle" />
              <div className="floating-note">
                <Bookmark size={17} />
                <span>
                  A new perspective
                  <br />
                  <strong>is always within reach.</strong>
                </span>
              </div>
              <div className="book-scene">
                <div className="scene-book scene-book-one">
                  <span>
                    THE WORLD
                    <br />
                    OF IDEAS
                  </span>
                  <div className="cover-lines" />
                  <small>DISCOVER SOMETHING NEW</small>
                </div>
                <div className="scene-book scene-book-two">
                  <span>
                    STAY
                    <br />
                    <em>curious.</em>
                  </span>
                  <BookOpen size={50} strokeWidth={0.8} />
                  <small>AN OPEN INVITATION</small>
                </div>
                <div className="scene-book scene-book-three">
                  <span>ART & CULTURE</span>
                </div>
                <div className="scene-shelf" />
              </div>
              <div className="art-plant">
                <i />
                <i />
                <i />
                <i />
                <span />
              </div>
            </div>
            <span className="art-stamp">
              GOOD BOOKS.
              <br />
              GREAT POSSIBILITIES.
            </span>
          </div>
        </section>
        <div className="landing-divider">
          <span>YOUR LIBRARY, REIMAGINED</span>
          <p>Less searching for a system. More finding your next read.</p>
          <LibraryBig size={25} strokeWidth={1.3} />
        </div>
        <section className="experience-section reveal-section" id="experience">
          <div className="section-intro">
            <p className="eyebrow">A LITTLE LESS FRICTION</p>
            <h2>
              More time for
              <br />
              <em>what’s inside.</em>
            </h2>
            <p>
              Everything you need to make the most of your library, together in
              one calm, connected space.
            </p>
          </div>
          <div className="experience-grid">
            {[
              [
                Search,
                "Find your next favorite",
                "Explore by title, author, subject, or ISBN. See what’s available before you visit.",
              ],
              [
                BookOpen,
                "Borrow with confidence",
                "Know your borrowing limits, keep track of your books, and see every due date at a glance.",
              ],
              [
                Bookmark,
                "Save your place in line",
                "Book already borrowed? Join the waiting list and get notified when it’s your turn.",
              ],
              [
                Clock3,
                "Stay a chapter ahead",
                "Timely reminders keep returns and reservation pickup dates from slipping past.",
              ],
            ].map(([Icon, title, text]) => (
              <article key={title}>
                <span className="feature-icon">
                  <Icon size={24} strokeWidth={1.5} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="collection-section reveal-section" id="collection">
          <div className="collection-illustration" aria-hidden="true">
            <div className="decorative-spine">LITERATURE</div>
            <div className="decorative-spine">THE SCIENCES</div>
            <div className="decorative-spine">ART & DESIGN</div>
            <div className="decorative-spine">HISTORY</div>
            <div className="decorative-spine">NEW PERSPECTIVES</div>
          </div>
          <div>
            <p className="eyebrow">FOLLOW YOUR CURIOSITY</p>
            <h2>
              There’s a world
              <br />
              between <em>these covers.</em>
            </h2>
            <p>
              From your course reading to your next unexpected interest, your
              library is here to help you keep discovering.
            </p>
            <Link className="button primary" to="/login">
              Discover the collection
            </Link>
          </div>
        </section>
        <section className="landing-cta reveal-section">
          <Sparkles size={28} strokeWidth={1.2} />
          <h2>
            Your next chapter
            <br />
            is waiting.
          </h2>
          <p>Come in with a question. Leave with a possibility.</p>
          <Link className="button cream" to="/login">
            Open your library
          </Link>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <p>A place for curious minds.</p>
        <span>Archthea Library</span>
      </footer>
    </div>
  );
}
