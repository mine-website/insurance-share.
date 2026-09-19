# Image Design Standard (use for EVERY poster)

## 1. The fixed layout

```
CANVAS                 1080 x 1080 px, square

MAIN DESIGN AREA       y = 0   to 960     (960 px tall)
                       headline, pictures, logo, everything visual

RESERVED STRIP         y = 960 to 1080    (120 px tall = the bottom 11 %)
                       flat solid white (#FFFFFF), completely empty

NAME SAFE AREA         x = 48  to 600     centre line y = 1022
MOBILE SAFE AREA       x = 632 to 1032    centre line y = 1022
```

A picture of this is in `docs/strip-guide.png`.

### Why these numbers

* **120 px** is tall enough for 36 px bold text with comfortable space above and below, and still small enough (11 %) that it costs almost no design space.
* **48 px side margins** keep text away from the edges, where WhatsApp previews and phone screens crop or round corners.
* **Name on the left (552 px wide), mobile on the right (400 px wide)**: a 10-digit number at 36 px needs about 340 px, a long Indian name about 500 px. The website shrinks text automatically if a name is longer.
* **Solid white** gives guaranteed contrast for the dark text and makes every poster look like part of one family.
* **Percent, not only pixels:** ChatGPT usually outputs 1024 x 1024, not 1080. The website scales any square image to 1080, so the strip must be described as "the bottom 11 %" as well as "120 px".

### Important safety net

By default the website **repaints the bottom 120 px itself** (solid white + a thin indigo line) before writing Name and Mobile. So even if ChatGPT draws something in the strip, the shared image is still clean. It only means: never put anything you care about in the bottom 11 %, because it will be covered.
If you ever want a coloured strip that is part of your artwork, untick "Paint a clean solid strip" for that template in the Admin tool.

## 2. Reusable ChatGPT prompt

Copy everything in the box, change only the three lines under "CONTENT", and paste into ChatGPT.

```
Create a premium, professional square social-media poster for WhatsApp.

CANVAS
- Exactly 1:1 square (1080 x 1080 px if possible, otherwise 1024 x 1024). Do not add borders or a frame around the image.

RESERVED BOTTOM STRIP (very important)
- The bottom 11 % of the image height (the bottom 120 px of 1080) is a reserved strip.
- Fill that strip with one flat, solid pure white (#FFFFFF). Nothing else.
- In the strip there must be NO text, NO numbers, NO icons, NO logos, NO lines, NO shapes, NO shadows, NO gradients, NO patterns, NO decorative objects and NO characters or objects overlapping into it.
- All artwork, all text and all graphics must end at least 30 px ABOVE the strip. Nothing may touch, cross or fade into the strip.
- The strip is left blank because contact details are added later by software.

MAIN DESIGN AREA (top 89 %)
- Modern, clean, trustworthy look suitable for an Indian insurance advisor.
- One strong headline, one short supporting line, and one simple, relevant illustration or icon.
- Large, easy-to-read text with high contrast. Keep 60 px margins on the left, right and top.
- Do not write any phone number, name, website or "contact us" text anywhere.
- Colour palette: deep indigo/blue with one warm accent colour, or as suggested by the topic.
- Text must be spelled exactly as given below (including Gujarati / Hindi script). Do not add extra text.

CONTENT
TOPIC: Car Insurance Renewal
HEADLINE: Insurance Expiry ના દિવસે યાદ ન આવે!
SUPPORTING TEXT: Renewal માટે થોડું વહેલું Planning કરો.
```

### After ChatGPT gives you the image

1. Look at the bottom strip. It should be plain white. (If it is not, don't worry: the website repaints it. If the *main artwork* runs into the strip, ask ChatGPT: "Move everything up so nothing is in the bottom 11 %.")
2. Check that the Gujarati/Hindi text is spelled correctly. AI image tools sometimes damage non-English letters; if so, regenerate or fix it in Canva.
3. Download it, then use the Admin tool (`/admin/`). It resizes to 1080 x 1080 WebP and makes the thumbnail.

Tip: if a picture is not square or comes out 1536 x 1024, ask ChatGPT for "square 1:1" again. The Admin tool warns you if the image is not square.
