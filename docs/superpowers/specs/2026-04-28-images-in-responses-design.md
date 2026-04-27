# Images in Responses Feature Design

**Date:** 2026-04-28
**Status:** Approved

## Overview

Add ability for the writer agent to include images from scraped sources in responses. Images appear inline with text at the AI's discretion, with proper styling and a zoomable modal on tap.

## Architecture

```
Scraper (JSON with images) → API route → Writer prompt (with images) → Markdown with ![alt](url) → Frontend renders <img>
```

## Data Flow

### Scraper Response
```json
{
  "content": "...text content...",
  "images": [
    { "title": "Descriptive alt text", "url": "https://...", "type": "image" }
  ]
}
```

### Writer Agent Prompt
```
=== AVAILABLE IMAGES ===
1. [title] - [url]
2. [title] - [url]
========================

Use ![alt text](url) to include images where relevant to the response.
```

### Writer Output
```markdown
The Golden Retriever is an excellent choice:

![Golden Retriever puppy](https://...)

They are known for being friendly...
```

## Components

### 1. Scraper Interface Update
**File:** `app/api/chat/route.ts`

Change scraper call from `format=text` to `format=json`:
- Parse JSON response
- Extract `content` (text) and `images` array
- Pass images to writer agent

### 2. Image Type
```typescript
interface ScrapedImage {
  title: string;
  url: string;
  type: 'image';
}
```

### 3. Writer Prompt Update
Include available images in context with instruction:
```
You have access to images from the scraped sources. Use markdown image syntax ![alt text](url) to include images where they enhance understanding.

Available images:
[formatted list]
```

### 4. MarkdownContent Image Rendering
**File:** `app/page.tsx` - MarkdownContent component

- Detect `![alt](url)` markdown syntax
- Render with:
  - Max height constraint (e.g., 400px)
  - Natural width (up to container)
  - Horizontal scroll if overflow
  - Rounded corners, subtle shadow
  - Click to open zoomable modal

### 5. Image Modal Component
**New component:** `ImageModal`

- Basic overlay with centered image
- Close button (X)
- Click outside to close
- Image displays at full size
- Smooth fade-in animation

## UI/UX Specifications

**Image styling:**
- Max-height: 400px
- Width: auto (natural)
- Border-radius: 8px
- Shadow: subtle
- Margin: my-4 (vertical spacing)
- Cursor: pointer (indicates clickable)

**Modal styling:**
- Fixed overlay (z-index high)
- Semi-transparent backdrop
- Centered image with max constraints
- Close button top-right
- Fade-in animation (150ms)

**Mobile:**
- Max-height: 300px (smaller)
- Modal fills screen width
- Touch-friendly close zone

## Error Handling

**Image load failures:**
- Show placeholder with alt text
- Don't break message rendering

**Scraper returns no images:**
- Continue without images
- No error shown to user

**Invalid image URLs:**
- Skip rendering, show alt text only
- Log for debugging

## Implementation Files

1. `app/api/chat/route.ts` - Update scraper call and writer prompt
2. `app/page.tsx` - Add image rendering to MarkdownContent, new ImageModal component

## Testing

1. Scraper returns images → verify they're passed to writer
2. Writer includes images in markdown → verify rendering
3. Click image → verify modal opens with full-size view
4. Close modal (X button, click outside, escape key)
5. Mobile responsive (smaller max-height, touch works)
6. Broken image URL → shows placeholder, doesn't crash
