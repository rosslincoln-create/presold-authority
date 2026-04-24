import { Hono } from 'hono'
import puppeteer from '@cloudflare/puppeteer'
import { Resend } from 'resend'
import { authMiddleware } from '../middleware/authMiddleware'
import type { Env } from '../index'
import type { AuthVariables } from '../middleware/authMiddleware'
import { generateId } from '../lib/auth'

const assets = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

assets.use('/*', authMiddleware)

const STATIC_ASSET_TYPES = new Set([
  '48hr-checklist',
  'one-pager-next',
  'one-pager-market',
  'one-pager-plan',
])

const AI_ASSET_TYPES = new Set([
  'positioning',
  'profile-copy',
  'content-pillars',
  'posts-10',
  'dm-flow',
  'boundary-library',
])

const COPY_TEXT_TYPES = new Set([
  'positioning',
  'profile-copy',
  'posts-10',
  'dm-flow',
  'boundary-library',
])

const ASSET_ORDER: {
  asset_type: string
  title: string
  description: string
}[] = [
  { asset_type: 'positioning', title: 'Authority Positioning Statement', description: 'Positioning statement, differentiators, and boundary line' },
  { asset_type: 'profile-copy', title: 'LinkedIn Profile Copy', description: 'LinkedIn headline, About section, and pinned post' },
  { asset_type: 'content-pillars', title: 'Content Pillars & Topic Map', description: '4 content pillars with 40 topic ideas and filter lines' },
  { asset_type: 'posts-10', title: 'First 10 Authority Posts', description: 'Your first 10 authority posts ready to publish' },
  { asset_type: 'dm-flow', title: 'Inbound DM Flow', description: 'Inbound DM sequence from first message to call booking' },
  { asset_type: 'boundary-library', title: 'Boundary Language Library', description: 'Professional phrases for posts, DMs, calls, and objections' },
  { asset_type: 'context-card', title: 'Agent Context Card', description: 'Your Agent Context Card — the source of truth for all outputs' },
  { asset_type: '48hr-checklist', title: '48-Hour Fast Start Checklist', description: 'Your 48-Hour Fast Start action checklist' },
  { asset_type: 'one-pager-next', title: 'Client One-Pager: NEXT', description: 'Client-facing one-pager: what happens next' },
  { asset_type: 'one-pager-market', title: 'Client One-Pager: MARKET', description: 'Client-facing one-pager: your market authority summary' },
  { asset_type: 'one-pager-plan', title: 'Client One-Pager: PLAN', description: 'Client-facing one-pager: your buyer or seller plan' },
]

type GeneratedRow = {
  id: string
  asset_type: string
  version: number
  is_current: number
  created_at: string
}

type ContextCardRow = {
  id: string
  updated_at: string | null
  full_name: string | null
  brokerage_name: string | null
  market_location: string | null
  phone: string | null
  agent_role: string | null
  years_experience: string | null
  process_step_1: string | null
  process_step_2: string | null
  process_step_3: string | null
  boundary_statement: string | null
  broker_disclaimer: string | null
  proof_points: string | null
  is_complete: number | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseContent(edited: string | null, raw: string | null): Record<string, unknown> {
  const str = edited ?? raw
  if (!str) return {}
  try {
    return JSON.parse(str) as Record<string, unknown>
  } catch {
    return {}
  }
}

function toTimeMs(value: string | null | undefined): number {
  if (value == null || value === '') return 0
  const t = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'))
  return Number.isNaN(t) ? 0 : t
}

async function logSystemEvent(
  db: D1Database,
  eventType: string,
  userId: string,
  referenceId: string,
  errorMessage: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO system_events (id, event_type, user_id, reference_id, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(generateId(), eventType, userId, referenceId, errorMessage)
    .run()
}

async function generatePDF(html: string, env: Env): Promise<Uint8Array> {
  const browser = await puppeteer.launch(env.BROWSER)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      printBackground: true,
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '15mm', left: '20mm' },
    })
    return new Uint8Array(pdf)
  } finally {
    await browser.close()
  }
}

function buildPDFWrapper(params: {
  assetTitle: string
  studentName: string
  brokerageName: string
  generatedDate: string
  bodyHTML: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif;
         background: #ffffff; color: #09090b; font-size: 14px;
         line-height: 1.6; }
  .pdf-header { background: #09090b; color: #ffffff; padding: 16px 24px;
                display: flex; justify-content: space-between;
                align-items: center; }
  .pdf-header .brand { color: #fbbf24; font-weight: 700; font-size: 13px;
                        letter-spacing: 0.08em; }
  .pdf-header .student { font-size: 12px; color: #a1a1aa; text-align: right; }
  .pdf-header .student strong { color: #ffffff; display: block; }
  .pdf-title { padding: 24px 24px 8px; border-bottom: 2px solid #fbbf24;
               margin-bottom: 24px; }
  .pdf-title h1 { font-size: 22px; font-weight: 700; color: #09090b; }
  .pdf-body { padding: 0 24px 24px; }
  .pdf-body h2 { font-size: 16px; font-weight: 700; margin: 20px 0 8px;
                  color: #09090b; border-bottom: 1px solid #e4e4e7;
                  padding-bottom: 4px; }
  .pdf-body h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px;
                  color: #09090b; }
  .pdf-body p { margin-bottom: 10px; color: #18181b; }
  .pdf-body ul, .pdf-body ol { padding-left: 20px; margin-bottom: 12px; }
  .pdf-body li { margin-bottom: 4px; }
  .callout { background: #fafafa; border-left: 4px solid #fbbf24;
              padding: 12px 16px; margin: 12px 0; border-radius: 0 6px 6px 0; }
  .callout p { margin: 0; font-weight: 500; }
  .divider { border: none; border-top: 1px solid #e4e4e7;
              margin: 20px 0; }
  .objection-card { background: #fafafa; border: 1px solid #e4e4e7;
                     border-radius: 6px; padding: 12px; margin-bottom: 10px; }
  .objection-q { font-weight: 600; color: #09090b; margin-bottom: 4px; }
  .objection-a { color: #3f3f46; }
  .pdf-footer { margin-top: 40px; padding: 12px 24px;
                border-top: 1px solid #e4e4e7;
                display: flex; justify-content: space-between;
                font-size: 11px; color: #a1a1aa; }
</style>
</head>
<body>
<div class="pdf-header">
  <div class="brand">PRE-SOLD AUTHORITY</div>
  <div class="student">
    <strong>${escapeHtml(params.studentName)}</strong>
    ${escapeHtml(params.brokerageName)}
  </div>
</div>
<div class="pdf-title">
  <h1>${escapeHtml(params.assetTitle)}</h1>
</div>
<div class="pdf-body">
  ${params.bodyHTML}
</div>
<div class="pdf-footer">
  <span>Generated ${escapeHtml(params.generatedDate)} · app.presoldauthority.com</span>
  <span>Confidential — prepared for ${escapeHtml(params.studentName)}</span>
</div>
</body>
</html>`
}

function getPostsArray(content: Record<string, unknown>): unknown[] {
  const posts = content.posts ?? content.authority_posts
  if (Array.isArray(posts)) return posts
  const fromValues = Object.values(content).find((v) => Array.isArray(v))
  return Array.isArray(fromValues) ? fromValues : []
}

function buildAssetBodyHTML(assetType: string, content: Record<string, unknown>, contextCard: ContextCardRow | null): string {
  const cc = contextCard
  switch (assetType) {
    case 'positioning': {
      const alt = (content.alternative_statements as string[] | undefined) ?? []
      const diff = (content.differentiators as { title?: string; description?: string }[] | undefined) ?? []
      const proof = (content.proof_cues as string[] | undefined) ?? []
      const primary = String(content.primary_positioning_statement ?? '')
      const boundary = String(content.boundary_statement ?? '')
      return `<div class="callout"><p>${escapeHtml(primary)}</p></div>
   <h2>Alternative Statements</h2>
   <ol>${alt.map((s) => `<li>${escapeHtml(String(s))}</li>`).join('')}</ol>
   <h2>Your Differentiators</h2>
   ${diff
     .map(
       (d) =>
         `<h3>${escapeHtml(String(d.title ?? ''))}</h3><p>${escapeHtml(String(d.description ?? ''))}</p>`
     )
     .join('')}
   <h2>Proof Cues</h2>
   <ul>${proof.map((p) => `<li>${escapeHtml(String(p))}</li>`).join('')}</ul>
   <h2>Your Boundary Statement</h2>
   <div class="callout"><p>${escapeHtml(boundary)}</p></div>`
    }
    case 'profile-copy': {
      const headlines = (content.headlines as string[] | undefined) ?? []
      const about = String(content.about_section ?? '')
      const pinned = (content.pinned_post as { hook?: string; bullets?: string[]; cta?: string } | undefined) ?? {}
      const bullets = pinned.bullets ?? []
      const aboutParts = about.split('\n').map((line) => `<p>${escapeHtml(line)}</p>`).join('')
      return `<h2>LinkedIn Headlines</h2>
   <ol>${headlines.map((h) => `<li>${escapeHtml(String(h))}</li>`).join('')}</ol>
   <h2>About Section</h2>
   ${aboutParts || '<p></p>'}
   <h2>Pinned Post</h2>
   <div class="callout"><p>${escapeHtml(String(pinned.hook ?? ''))}</p></div>
   <ul>${bullets.map((b) => `<li>${escapeHtml(String(b))}</li>`).join('')}</ul>
   <p><strong>CTA:</strong> ${escapeHtml(String(pinned.cta ?? ''))}</p>`
    }
    case 'content-pillars': {
      const pillars = (content.pillars ?? content.content_pillars ?? []) as Record<string, unknown>[]
      const filterLines = (content.filter_lines as string[] | undefined) ?? []
      return `<h2>Your Content Pillars</h2>
   ${pillars
     .map((p) => {
       const name = String(p.pillar_name ?? p.name ?? '')
       const desc = String(p.pillar_description ?? p.description ?? '')
       const topics = (p.topics as string[] | undefined) ?? []
       const avoid = p.avoid_topics as string[] | undefined
       const avoidBlock =
         avoid && avoid.length
           ? `<h3>Avoid</h3>
      <ul>${avoid.map((t) => `<li>${escapeHtml(String(t))}</li>`).join('')}</ul>`
           : ''
       return `<h3>${escapeHtml(name)}</h3>
      <p>${escapeHtml(desc)}</p>
      <h3>Topics</h3>
      <ol>${topics.map((t) => `<li>${escapeHtml(String(t))}</li>`).join('')}</ol>
      ${avoidBlock}
      <hr class="divider">`
     })
     .join('')}
   <h2>Filter Lines</h2>
   <ol>${filterLines.map((f) => `<li>${escapeHtml(String(f))}</li>`).join('')}</ol>`
    }
    case 'posts-10': {
      const arr = getPostsArray(content) as Record<string, unknown>[]
      return arr
        .map((p, i) => {
          const hook = String(p.hook ?? p.opening ?? '')
          const bullets = (p.bullets ?? p.content ?? p.body_bullets ?? []) as string[]
          const cta = String(p.cta ?? p.call_to_action ?? '')
          const bulletList = Array.isArray(bullets)
            ? bullets.map((b) => `<li>${escapeHtml(String(b))}</li>`).join('')
            : ''
          return `<h2>Post ${i + 1}</h2>
       <div class="callout"><p>${escapeHtml(hook)}</p></div>
       <ul>${bulletList}</ul>
       <p><strong>CTA:</strong> ${escapeHtml(cta)}</p>
       ${i < arr.length - 1 ? '<hr class="divider">' : ''}`
        })
        .join('')
    }
    case 'dm-flow': {
      return Object.entries(content)
        .map(([key, val]) => {
          const title = key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
          const inner = Array.isArray(val)
            ? `<ol>${val
                .map((v) => `<li>${typeof v === 'string' ? escapeHtml(v) : escapeHtml(JSON.stringify(v))}</li>`)
                .join('')}</ol>`
            : `<p>${escapeHtml(String(val))}</p>`
          return `<h2>${escapeHtml(title)}</h2>
      ${inner}`
        })
        .join('')
    }
    case 'boundary-library': {
      const postF = (content.post_filter_lines as string[] | undefined) ?? []
      const dmB = (content.dm_boundary_lines as string[] | undefined) ?? []
      const callO = (content.call_opening_lines as string[] | undefined) ?? []
      const timeP = (content.time_protection_lines as string[] | undefined) ?? []
      const objR =
        (content.objection_responses as { objection?: string; response?: string }[] | undefined) ?? []
      return `<h2>Post Filter Lines</h2>
   <ol>${postF.map((l) => `<li>${escapeHtml(String(l))}</li>`).join('')}</ol>
   <h2>DM Boundary Lines</h2>
   <ol>${dmB.map((l) => `<li>${escapeHtml(String(l))}</li>`).join('')}</ol>
   <h2>Call Opening Lines</h2>
   <ol>${callO.map((l) => `<li>${escapeHtml(String(l))}</li>`).join('')}</ol>
   <h2>Time Protection Lines</h2>
   <ol>${timeP.map((l) => `<li>${escapeHtml(String(l))}</li>`).join('')}</ol>
   <h2>Objection Responses</h2>
   ${objR
     .map(
       (o) =>
         `<div class="objection-card">
       <div class="objection-q">${escapeHtml(String(o.objection ?? ''))}</div>
       <div class="objection-a">${escapeHtml(String(o.response ?? ''))}</div>
      </div>`
     )
     .join('')}`
    }
    case 'context-card':
      if (!cc) return '<p>No context card on file.</p>'
      return buildContextCardBodyHTML(cc)
    case '48hr-checklist':
      return `<h2>Day 1 — Your First 2 Hours</h2>
   <ul style="list-style:none;padding:0;">
     <li style="padding:6px 0;">□ Complete your Agent Context Card (Onboarding / Lesson 3)</li>
     <li style="padding:6px 0;">□ Run the Authority Positioning Generator (Lesson 4)</li>
     <li style="padding:6px 0;">□ Run the Profile Install builder (Lesson 5) — choose your headline</li>
     <li style="padding:6px 0;">□ Update your LinkedIn headline today</li>
   </ul>
   <h2>Day 2 — Deploy Your Profile</h2>
   <ul style="list-style:none;padding:0;">
     <li style="padding:6px 0;">□ Finalise and publish your LinkedIn About section</li>
     <li style="padding:6px 0;">□ Create and pin your Pinned Post</li>
     <li style="padding:6px 0;">□ Run the Content Pillars builder (Lesson 6)</li>
     <li style="padding:6px 0;">□ Download your Core Positioning PDF</li>
   </ul>
   <h2>After Day 2</h2>
   <ul style="list-style:none;padding:0;">
     <li style="padding:6px 0;">□ Generate your first 3 authority posts (Lesson 7)</li>
     <li style="padding:6px 0;">□ Schedule Post #1 to go live today</li>
     <li style="padding:6px 0;">□ Set up your DM flow (Lesson 7 Part B)</li>
     <li style="padding:6px 0;">□ Review your Boundary Language Library (Lesson 8)</li>
     <li style="padding:6px 0;">□ Choose your weekly rhythm (30 / 60 / 90 min)</li>
   </ul>`
    case 'one-pager-next':
      if (!cc) return ''
      return `<h2>What Happens Next — Working With ${escapeHtml(String(cc.full_name ?? ''))}</h2>
   <p>Here is exactly what to expect when we work together:</p>
   <h3>Step 1</h3><p>${escapeHtml(String(cc.process_step_1 ?? ''))}</p>
   <h3>Step 2</h3><p>${escapeHtml(String(cc.process_step_2 ?? ''))}</p>
   <h3>Step 3</h3><p>${escapeHtml(String(cc.process_step_3 ?? ''))}</p>
   ${
     cc.broker_disclaimer
       ? `<p style="margin-top:24px;font-size:11px;color:#71717a;">
         ${escapeHtml(String(cc.broker_disclaimer))}</p>`
       : ''
   }
   <p style="margin-top:16px;"><strong>Questions?</strong>
     Contact ${escapeHtml(String(cc.full_name ?? ''))} at ${escapeHtml(String(cc.phone ?? ''))}</p>`
    case 'one-pager-market':
      if (!cc) return ''
      {
        let proofList: string[] = []
        try {
          proofList = JSON.parse(cc.proof_points || '[]') as string[]
        } catch {
          proofList = []
        }
        return `<h2>${escapeHtml(String(cc.full_name ?? ''))} — ${escapeHtml(String(cc.market_location ?? ''))} Market Authority</h2>
   <p>${escapeHtml(String(cc.years_experience ?? ''))} years serving ${escapeHtml(String(cc.market_location ?? ''))}
      with ${escapeHtml(String(cc.brokerage_name ?? ''))}</p>
   <h2>Why Clients Choose Me</h2>
   <ul>${proofList.map((p) => `<li>${escapeHtml(String(p))}</li>`).join('')}</ul>
   <h2>My Boundary Statement</h2>
   <div class="callout"><p>${escapeHtml(String(cc.boundary_statement ?? ''))}</p></div>
   <p><strong>${escapeHtml(String(cc.phone ?? ''))}</strong></p>`
      }
    case 'one-pager-plan':
      if (!cc) return ''
      {
        const role = String(cc.agent_role ?? '').toLowerCase()
        const label =
          role === 'buyer' || role === 'hybrid' ? 'Your Buyer Plan' : role === 'listing' ? 'Your Seller Plan' : 'Your Plan'
        return `<h2>${escapeHtml(label)} with ${escapeHtml(String(cc.full_name ?? ''))}</h2>
   <p>${escapeHtml(String(cc.brokerage_name ?? ''))} · ${escapeHtml(String(cc.market_location ?? ''))}</p>
   <h2>How We Work Together</h2>
   <ol>
     <li>${escapeHtml(String(cc.process_step_1 ?? ''))}</li>
     <li>${escapeHtml(String(cc.process_step_2 ?? ''))}</li>
     <li>${escapeHtml(String(cc.process_step_3 ?? ''))}</li>
   </ol>
   ${
     cc.broker_disclaimer
       ? `<p style="font-size:11px;color:#71717a;margin-top:24px;">
         ${escapeHtml(String(cc.broker_disclaimer))}</p>`
       : ''
   }
   <p><strong>Contact:</strong> ${escapeHtml(String(cc.phone ?? ''))}</p>`
      }
    default:
      return '<p></p>'
  }
}

function buildContextCardBodyHTML(contextCard: ContextCardRow): string {
  let proofList: string[] = []
  try {
    proofList = JSON.parse(contextCard.proof_points || '[]') as string[]
  } catch {
    proofList = []
  }
  return `<h2>Your Details</h2>
   <p><strong>Name:</strong> ${escapeHtml(String(contextCard.full_name ?? ''))}</p>
   <p><strong>Market:</strong> ${escapeHtml(String(contextCard.market_location ?? ''))}</p>
   <p><strong>Role:</strong> ${escapeHtml(String(contextCard.agent_role ?? ''))}</p>
   <p><strong>Brokerage:</strong> ${escapeHtml(String(contextCard.brokerage_name ?? ''))}</p>
   <p><strong>Experience:</strong> ${escapeHtml(String(contextCard.years_experience ?? ''))} years</p>
   <h2>Your 3-Step Process</h2>
   <ol>
     <li>${escapeHtml(String(contextCard.process_step_1 ?? ''))}</li>
     <li>${escapeHtml(String(contextCard.process_step_2 ?? ''))}</li>
     <li>${escapeHtml(String(contextCard.process_step_3 ?? ''))}</li>
   </ol>
   <h2>Proof Points</h2>
   <ul>${proofList.map((p) => `<li>${escapeHtml(String(p))}</li>`).join('')}</ul>
   <h2>Boundary Statement</h2>
   <div class="callout"><p>${escapeHtml(String(contextCard.boundary_statement ?? ''))}</p></div>
   ${
     contextCard.broker_disclaimer
       ? `<h2>Broker Disclaimer</h2><p>${escapeHtml(String(contextCard.broker_disclaimer))}</p>`
       : ''
   }`
}

function formatAsText(assetType: string, content: Record<string, unknown>): string {
  switch (assetType) {
    case 'positioning': {
      const alt = (content.alternative_statements as string[] | undefined) ?? []
      const diff = (content.differentiators as { title?: string; description?: string }[] | undefined) ?? []
      const proof = (content.proof_cues as string[] | undefined) ?? []
      return (
        `PRIMARY POSITIONING STATEMENT\n${String(content.primary_positioning_statement ?? '')}\n\n` +
        `ALTERNATIVE STATEMENTS\n${alt.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` +
        `DIFFERENTIATORS\n${diff.map((d) => `• ${d.title}: ${d.description}`).join('\n')}\n\n` +
        `PROOF CUES\n${proof.map((p) => `• ${p}`).join('\n')}\n\n` +
        `BOUNDARY STATEMENT\n${String(content.boundary_statement ?? '')}`
      )
    }
    case 'profile-copy': {
      const headlines = (content.headlines as string[] | undefined) ?? []
      const pinned = (content.pinned_post as { hook?: string; bullets?: string[]; cta?: string } | undefined) ?? {}
      const bullets = pinned.bullets ?? []
      return (
        `HEADLINES\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n\n` +
        `ABOUT SECTION\n${String(content.about_section ?? '')}\n\n` +
        `PINNED POST\nHook: ${pinned.hook ?? ''}\n` +
        bullets.map((b) => `• ${b}`).join('\n') +
        `\nCTA: ${pinned.cta ?? ''}`
      )
    }
    case 'posts-10': {
      const arr = getPostsArray(content) as Record<string, unknown>[]
      return arr
        .map((p, i) => {
          const hook = String(p.hook ?? p.opening ?? '')
          const bullets = (p.bullets ?? p.content ?? p.body_bullets ?? []) as string[]
          const bulletStr = Array.isArray(bullets) ? bullets.map((b) => `• ${b}`).join('\n') : ''
          const cta = String(p.cta ?? p.call_to_action ?? '')
          return `POST ${i + 1}\n${hook}\n${bulletStr}\n${cta}`
        })
        .join('\n\n---\n\n')
    }
    case 'dm-flow': {
      return Object.entries(content)
        .map(([key, val]) => {
          const label = key.toUpperCase().replace(/_/g, ' ')
          const body = Array.isArray(val)
            ? val
                .map((v, i) => `${i + 1}. ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                .join('\n')
            : String(val)
          return `${label}\n${body}`
        })
        .join('\n\n')
    }
    case 'boundary-library': {
      const postF = (content.post_filter_lines as string[] | undefined) ?? []
      const dmB = (content.dm_boundary_lines as string[] | undefined) ?? []
      const callO = (content.call_opening_lines as string[] | undefined) ?? []
      const timeP = (content.time_protection_lines as string[] | undefined) ?? []
      const objR =
        (content.objection_responses as { objection?: string; response?: string }[] | undefined) ?? []
      return (
        `POST FILTER LINES\n${postF.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n` +
        `DM BOUNDARY LINES\n${dmB.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n` +
        `CALL OPENING LINES\n${callO.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n` +
        `TIME PROTECTION LINES\n${timeP.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n` +
        `OBJECTION RESPONSES\n${objR.map((o, i) => `${i + 1}. ${o.objection}\n   → ${o.response}`).join('\n\n')}`
      )
    }
    default:
      return ''
  }
}

function assetTitleForPdf(assetType: string): string {
  const def = ASSET_ORDER.find((a) => a.asset_type === assetType)
  return def?.title ?? assetType
}

async function maybeSendE9WinEmail(
  env: Env,
  db: D1Database,
  userId: string,
  recipientEmail: string,
  fullName: string | null
): Promise<void> {
  const firstName = fullName?.trim() ? fullName.trim().split(/\s+/)[0] : 'there'
  const textBody =
    `Congratulations ${firstName} —\n\n` +
    `Your first Pre-Sold Authority asset is downloaded and ready to deploy.\n\n` +
    `Your next step: update your LinkedIn headline today with your new positioning\n` +
    `statement. It takes 2 minutes and is the highest-leverage move you can make\n` +
    `right now.\n\n` +
    `Log in to continue: https://app.presoldauthority.com/dashboard\n\n` +
    `— Ross`

  const logId = generateId()
  let status: 'sent' | 'failed' = 'failed'
  let resendId: string | null = null

  try {
    const resend = new Resend(env.RESEND_API_KEY)
    const { data, error } = await resend.emails.send({
      from: 'Pre-Sold Authority System <support@mail.presoldauthority.com>',
      to: recipientEmail,
      subject: "You've got your first authority asset — here's what to do next",
      text: textBody,
    })

    if (error) {
      console.error('[assets] E9 send error:', error)
      await logSystemEvent(db, 'e9_email_failed', userId, 'E9', error.message ?? String(error))
    } else {
      status = 'sent'
      resendId = data?.id ?? null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assets] E9 send exception:', message)
    await logSystemEvent(db, 'e9_email_failed', userId, 'E9', message)
  }

  try {
    await db
      .prepare(
        `INSERT INTO email_log (id, user_id, recipient_email, template_id, status, resend_id, sent_at, created_at)
         VALUES (?, ?, ?, 'E9', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .bind(logId, userId, recipientEmail, status, resendId)
      .run()
  } catch (logErr) {
    console.error('[assets] email_log insert failed (E9):', logErr)
  }
}

assets.get('/', async (c) => {
  try {
    const userId = c.get('userId')

    const genResult = await c.env.DB.prepare(
      `SELECT id, asset_type, version, is_current, created_at
       FROM generated_assets
       WHERE user_id = ?
       ORDER BY asset_type, version ASC`
    )
      .bind(userId)
      .all<GeneratedRow>()

    const rows = (genResult.results ?? []) as GeneratedRow[]

    const ccRow = await c.env.DB.prepare(
      `SELECT id, updated_at, full_name, brokerage_name, market_location, phone,
              agent_role, years_experience, process_step_1, process_step_2, process_step_3,
              boundary_statement, broker_disclaimer, proof_points, is_complete
       FROM context_cards
       WHERE user_id = ?`
    )
      .bind(userId)
      .first<ContextCardRow>()

    const byType = new Map<string, GeneratedRow[]>()
    for (const r of rows) {
      const list = byType.get(r.asset_type) ?? []
      list.push(r)
      byType.set(r.asset_type, list)
    }

    const contextCardPayload = ccRow
      ? {
          updated_at: ccRow.updated_at,
          full_name: ccRow.full_name,
          brokerage_name: ccRow.brokerage_name,
          market_location: ccRow.market_location,
          phone: ccRow.phone,
          agent_role: ccRow.agent_role,
          years_experience: ccRow.years_experience,
          process_step_1: ccRow.process_step_1,
          process_step_2: ccRow.process_step_2,
          process_step_3: ccRow.process_step_3,
          boundary_statement: ccRow.boundary_statement,
          broker_disclaimer: ccRow.broker_disclaimer,
          proof_points: ccRow.proof_points,
        }
      : {
          updated_at: null,
          full_name: null,
          brokerage_name: null,
          market_location: null,
          phone: null,
          agent_role: null,
          years_experience: null,
          process_step_1: null,
          process_step_2: null,
          process_step_3: null,
          boundary_statement: null,
          broker_disclaimer: null,
          proof_points: null,
        }

    const assetsOut = ASSET_ORDER.map((def) => {
      const t = def.asset_type

      if (STATIC_ASSET_TYPES.has(t)) {
        return {
          asset_type: t,
          status: 'available' as const,
          versions: [] as { id: string; version: number; created_at: string; is_current: boolean }[],
          current_asset_id: null as string | null,
        }
      }

      if (t === 'context-card') {
        if (!ccRow) {
          return {
            asset_type: t,
            status: 'not_generated' as const,
            versions: [],
            current_asset_id: null,
          }
        }
        if (ccRow.is_complete === 1) {
          return {
            asset_type: t,
            status: 'generated' as const,
            versions: [],
            current_asset_id: ccRow.id,
          }
        }
        return {
          asset_type: t,
          status: 'outdated' as const,
          versions: [],
          current_asset_id: ccRow.id,
        }
      }

      const typeRows = byType.get(t) ?? []
      if (typeRows.length === 0) {
        return {
          asset_type: t,
          status: 'not_generated' as const,
          versions: [],
          current_asset_id: null,
        }
      }

      let mostRecent = 0
      for (const r of typeRows) {
        const ms = toTimeMs(r.created_at)
        if (ms > mostRecent) mostRecent = ms
      }

      const ctxUpdated = toTimeMs(ccRow?.updated_at ?? null)
      const outdatedFromContext = ccRow != null && ctxUpdated > mostRecent

      const status =
        outdatedFromContext ? ('outdated' as const) : ('generated' as const)

      const versions = typeRows.map((r) => ({
        id: r.id,
        version: r.version,
        created_at: r.created_at,
        is_current: r.is_current === 1,
      }))

      const current = typeRows.find((r) => r.is_current === 1) ?? typeRows[typeRows.length - 1]

      return {
        asset_type: t,
        status,
        versions,
        current_asset_id: current?.id ?? null,
      }
    })

    return c.json({ assets: assetsOut, contextCard: contextCardPayload })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assets] GET / error:', message)
    return c.json({ error: message }, 500)
  }
})

type AssetRow = {
  id: string
  asset_type: string
  version: number
  edited_content: string | null
  raw_output: string | null
}

async function fetchGeneratedAsset(
  db: D1Database,
  userId: string,
  assetType: string,
  assetId: string | null | undefined
): Promise<AssetRow | null> {
  if (assetId) {
    return await db
      .prepare(
        `SELECT id, asset_type, version, edited_content, raw_output
         FROM generated_assets WHERE id = ? AND user_id = ?`
      )
      .bind(assetId, userId)
      .first<AssetRow>()
  }
  return await db
    .prepare(
      `SELECT id, asset_type, version, edited_content, raw_output
       FROM generated_assets
       WHERE user_id = ? AND asset_type = ? AND is_current = 1`
    )
    .bind(userId, assetType)
    .first<AssetRow>()
}

assets.post('/:assetType/download', async (c) => {
  const userId = c.get('userId')
  const assetType = c.req.param('assetType')

  let body: { assetId?: string | null } = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }
  const { assetId } = body

  try {
    const allTypes = new Set([...STATIC_ASSET_TYPES, ...AI_ASSET_TYPES, 'context-card'])
    if (!allTypes.has(assetType)) {
      return c.json({ error: 'Unknown asset type' }, 404)
    }

    const ccRow = await c.env.DB.prepare(
      `SELECT id, updated_at, full_name, brokerage_name, market_location, phone,
              agent_role, years_experience, process_step_1, process_step_2, process_step_3,
              boundary_statement, broker_disclaimer, proof_points, is_complete
       FROM context_cards WHERE user_id = ?`
    )
      .bind(userId)
      .first<ContextCardRow>()

    let content: Record<string, unknown> = {}
    let bodyHTML = ''
    let resolvedGeneratedRow: AssetRow | null = null
    const studentName = String(ccRow?.full_name ?? 'Student')
    const brokerageName = String(ccRow?.brokerage_name ?? '')
    const generatedDate = new Date().toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    if (STATIC_ASSET_TYPES.has(assetType)) {
      if (!ccRow) {
        return c.json({ error: 'Context card required' }, 400)
      }
      bodyHTML = buildAssetBodyHTML(assetType, {}, ccRow as ContextCardRow)
    } else if (assetType === 'context-card') {
      if (!ccRow) {
        return c.json({ error: 'Context card not found' }, 404)
      }
      bodyHTML = buildAssetBodyHTML('context-card', {}, ccRow as ContextCardRow)
    } else {
      resolvedGeneratedRow = await fetchGeneratedAsset(c.env.DB, userId, assetType, assetId ?? undefined)
      if (!resolvedGeneratedRow) {
        return c.json({ error: 'Asset not found' }, 404)
      }
      content = parseContent(resolvedGeneratedRow.edited_content, resolvedGeneratedRow.raw_output)
      bodyHTML = buildAssetBodyHTML(assetType, content, (ccRow as ContextCardRow) ?? null)
    }

    const html = buildPDFWrapper({
      assetTitle: assetTitleForPdf(assetType),
      studentName,
      brokerageName,
      generatedDate,
      bodyHTML,
    })

    const pdf = await generatePDF(html, c.env)

    const countRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM download_events WHERE user_id = ?`
    )
      .bind(userId)
      .first<{ cnt: number }>()
    const isFirstDownload = Number(countRow?.cnt ?? 0) === 0

    const downloadId = generateId()
    const downloadAssetId = STATIC_ASSET_TYPES.has(assetType)
      ? null
      : assetType === 'context-card'
        ? (ccRow?.id as string | undefined) ?? null
        : resolvedGeneratedRow?.id ?? null

    await c.env.DB.prepare(
      `INSERT INTO download_events (id, user_id, asset_type, asset_id, downloaded_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(downloadId, userId, assetType, downloadAssetId)
      .run()

    if (isFirstDownload) {
      const userRow = await c.env.DB.prepare(
        `SELECT email, full_name FROM users WHERE id = ?`
      )
        .bind(userId)
        .first<{ email: string; full_name: string | null }>()
      if (userRow?.email) {
        await maybeSendE9WinEmail(c.env, c.env.DB, userId, userRow.email, userRow.full_name)
      }
    }

    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${assetType}.pdf"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assets] download error:', message)
    await logSystemEvent(c.env.DB, 'asset_download_error', userId, assetType, message)
    return c.json({ error: message }, 500)
  }
})

assets.get('/:assetType/text', async (c) => {
  try {
    const userId = c.get('userId')
    const assetType = c.req.param('assetType')
    const assetId = c.req.query('assetId')

    if (!COPY_TEXT_TYPES.has(assetType)) {
      return c.json({ error: 'Copy text not available for this asset' }, 404)
    }

    const asset = await fetchGeneratedAsset(c.env.DB, userId, assetType, assetId ?? undefined)
    if (!asset) {
      return c.json({ error: 'Asset not found' }, 404)
    }

    const content = parseContent(asset.edited_content, asset.raw_output)
    const text = formatAsText(assetType, content)
    return c.json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assets] text error:', message)
    return c.json({ error: message }, 500)
  }
})

export default assets
