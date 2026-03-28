import { useNavigate } from 'react-router-dom'

const PERSONAS = [
  {
    name: 'Sarah, 42',
    emoji: '🏃‍♀️',
    subtitle: 'Getting fitter from home',
    color: 'teal',
    story:
      "Sarah hasn't exercised regularly since her kids were small. She doesn't want a gym membership — she wants to walk more, maybe try couch to 5K, and do some simple bodyweight exercises at home. Rex built her a 3-day programme with no equipment needed. Fitz checks in each week, helping her notice when low energy is linked to stress at work, not laziness.",
    tags: ['Walking', 'Couch to 5K', 'Bodyweight', 'Home'],
  },
  {
    name: 'Marcus, 31',
    emoji: '🏋️',
    subtitle: 'Making the gym stick',
    color: 'slate',
    story:
      "Marcus has a gym membership he barely uses. He knows what he wants — more strength, less stress — but never quite has a plan. Rex gave him a structured 4-day lifting programme. Fitz helped him spot that his worst training weeks always follow bad sleep, and together they've been working on a wind-down routine that actually helps.",
    tags: ['Gym', 'Strength', 'Barbells', 'Sleep & recovery'],
  },
]

const PILLARS = [
  {
    icon: '🏃',
    title: 'Physical',
    description:
      'Rex builds exercise programmes tailored to your goals, experience, and equipment — from gym lifting to home bodyweight training, walking, and couch to 5K.',
  },
  {
    icon: '💚',
    title: 'Emotional',
    description:
      "Fitz is there for how you're actually feeling. Stress, low mood, sleep struggles, motivation dips — these affect your health just as much as exercise does.",
  },
  {
    icon: '🤝',
    title: 'Social',
    description:
      "We know from research that connection matters for health. Fitz gently prompts you to notice your social world — not to lecture, but because isolation and loneliness are real health risks.",
  },
]

export default function About() {
  const navigate = useNavigate()

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 pb-16 space-y-10">

      {/* Hero */}
      <section className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-3 tracking-tight">
          Not a plan. A conversation.
        </h1>
        <p className="text-base text-gray-500 leading-relaxed max-w-lg mx-auto">
          Alongside is a biopsychosocial wellbeing app. That's a long word for a simple idea:
          your health is shaped by your body, your mind, and the people around you — and you need
          support across all three.
        </p>
      </section>

      {/* Not just a gym app */}
      <section className="bg-teal-50 border border-teal-100 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-teal-800 mb-3">
          This isn't just another gym app
        </h2>
        <p className="text-sm text-teal-700 leading-relaxed mb-4">
          Most fitness apps give you a plan and leave you to get on with it. Alongside works
          differently. Instead of handing you a 12-week programme and hoping for the best,
          your two AI coaches — Fitz and Rex — have conversations with you. They adapt.
          They notice. They ask.
        </p>
        <p className="text-sm text-teal-700 leading-relaxed">
          Rex handles exercise: building programmes, explaining technique, managing your
          training load. Fitz handles everything else: how you're feeling, what's getting
          in the way, how your sleep is, whether you've spent time with people you care about.
        </p>
      </section>

      {/* Three pillars */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Three dimensions of wellbeing
        </h2>
        <div className="space-y-3">
          {PILLARS.map(p => (
            <div
              key={p.title}
              className="bg-white border border-gray-100 rounded-2xl p-4 flex gap-4 items-start"
            >
              <span className="text-2xl shrink-0 mt-0.5">{p.icon}</span>
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-1">{p.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Meet your coaches */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Meet your coaches</h2>
        <div className="grid grid-cols-2 gap-3">

          <div className="bg-teal-600 rounded-2xl p-4 text-white">
            <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center font-bold text-lg mb-3">
              F
            </div>
            <h3 className="font-semibold text-sm mb-1">Fitz</h3>
            <p className="text-xs text-teal-100 leading-relaxed mb-3">
              Wellbeing coach. Fitz uses structured coaching techniques to help you
              set goals, understand your patterns, manage stress, and feel more in control.
              Suggests mindfulness and body scans when they'd help.
            </p>
            <button
              onClick={() => navigate('/chat/fitz')}
              className="text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors px-3 py-1.5 rounded-xl"
            >
              Talk to Fitz →
            </button>
          </div>

          <div className="bg-slate-800 rounded-2xl p-4 text-white">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-lg mb-3">
              R
            </div>
            <h3 className="font-semibold text-sm mb-1">Rex</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              AI personal trainer. Rex builds programmes for gym, home, or outdoors —
              whatever your goal and equipment. Explains exercises, tracks your load,
              and adjusts when life gets in the way.
            </p>
            <button
              onClick={() => navigate('/chat/rex')}
              className="text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors px-3 py-1.5 rounded-xl"
            >
              Talk to Rex →
            </button>
          </div>
        </div>
      </section>

      {/* People like you */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          People who use Alongside
        </h2>
        <div className="space-y-4">
          {PERSONAS.map(p => (
            <div
              key={p.name}
              className={`rounded-2xl p-5 border ${
                p.color === 'teal'
                  ? 'bg-teal-50 border-teal-100'
                  : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{p.emoji}</span>
                <div>
                  <p className="font-semibold text-sm text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.subtitle}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">{p.story}</p>
              <div className="flex flex-wrap gap-2">
                {p.tags.map(tag => (
                  <span
                    key={tag}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      p.color === 'teal'
                        ? 'bg-teal-100 text-teal-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Important notice */}
      <section className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-amber-800 mb-2">Important to know</h2>
        <ul className="space-y-2 text-xs text-amber-700 leading-relaxed">
          <li>• Alongside is an AI coaching tool — not a substitute for medical advice, therapy, or physiotherapy.</li>
          <li>• Fitz is not a therapist or counsellor. If you are struggling with your mental health, please speak to a healthcare professional.</li>
          <li>• Rex is not a physiotherapist or doctor. If you have an injury, pain, or a health condition, please consult your GP or a qualified professional before starting exercise.</li>
          <li>• In a mental health crisis, please call your local emergency services or a crisis line — see the banner at the top of the Fitz chat screen.</li>
        </ul>
      </section>

      {/* Privacy notice */}
      <section className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Privacy &amp; your data</h2>
        <div className="space-y-3 text-xs text-gray-500 leading-relaxed">
          <p>
            <span className="font-semibold text-gray-600">What we collect.</span>{' '}
            Alongside collects your name, email address, age, gender, activity
            confidence level, and country when you register. We also store information
            you provide during coaching conversations, activity logs, wellbeing check-ins,
            and goal-setting sessions.
          </p>
          <p>
            <span className="font-semibold text-gray-600">How we use it.</span>{' '}
            Your data is used solely to provide and personalise your Alongside coaching
            experience. We do not sell your data or share it with third parties for
            marketing purposes.
          </p>
          <p>
            <span className="font-semibold text-gray-600">Who may see it.</span>{' '}
            During the current beta period, registration requests are reviewed manually
            by the Alongside team. Your name, email, and registration details will be
            seen by us for access approval. Coaching conversation content is processed
            by Anthropic's Claude API — Anthropic does not use your conversations to
            train its models under our usage agreement.
          </p>
          <p>
            <span className="font-semibold text-gray-600">Where it is stored.</span>{' '}
            Your data is stored securely using Supabase, which operates EU-region
            infrastructure. We use appropriate technical and organisational measures
            to protect your personal information.
          </p>
          <p>
            <span className="font-semibold text-gray-600">Your rights.</span>{' '}
            Under UK GDPR and EU GDPR you have the right to access, correct, delete,
            or restrict the processing of your personal data. You may also withdraw
            consent at any time by closing your account. To exercise any of these
            rights, contact us at{' '}
            <a href="mailto:hello@alongside.fit" className="text-teal-600 hover:underline">
              hello@alongside.fit
            </a>
            .
          </p>
          <p>
            <span className="font-semibold text-gray-600">Lawful basis.</span>{' '}
            We process your personal data on the basis of your consent, given when
            you complete registration. You may withdraw this consent at any time.
          </p>
          <p>
            <span className="font-semibold text-gray-600">Data controller.</span>{' '}
            Alongside is the data controller for your personal information.
            For all privacy enquiries contact hello@alongside.fit.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center pt-2">
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-sm"
        >
          Go to my dashboard
        </button>
      </section>

    </main>
  )
}
