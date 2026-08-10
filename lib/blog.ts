import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { remark } from 'remark'
import html from 'remark-html'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

export type BlogPostMeta = {
  slug: string
  title: string
  description: string
  date: string
}

export type BlogPost = BlogPostMeta & {
  contentHtml: string
}

function ensureBlogDir() {
  if (!fs.existsSync(BLOG_DIR)) {
    fs.mkdirSync(BLOG_DIR, { recursive: true })
  }
}

function parseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return ''
}

function readMeta(slug: string, data: Record<string, unknown>): BlogPostMeta {
  const title = typeof data.title === 'string' ? data.title.trim() : slug
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  const date = parseDate(data.date)

  return { slug, title, description, date }
}

/** List all posts sorted by date (newest first). */
export function getAllPosts(): BlogPostMeta[] {
  ensureBlogDir()

  const files = fs.readdirSync(BLOG_DIR).filter((name) => name.endsWith('.md'))

  const posts = files.map((filename) => {
    const slug = filename.replace(/\.md$/i, '')
    const raw = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8')
    const { data } = matter(raw)
    return readMeta(slug, data as Record<string, unknown>)
  })

  return posts.sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title)
    return a.date < b.date ? 1 : -1
  })
}

/** Load one post by slug, or null if missing. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  ensureBlogDir()

  const filePath = path.join(BLOG_DIR, `${slug}.md`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf8')
  const { data, content } = matter(raw)
  const processed = await remark().use(html).process(content)
  const contentHtml = processed.toString()

  return {
    ...readMeta(slug, data as Record<string, unknown>),
    contentHtml,
  }
}

export function getAllPostSlugs(): string[] {
  return getAllPosts().map((post) => post.slug)
}

export function formatPostDate(date: string): string {
  if (!date) return ''
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
