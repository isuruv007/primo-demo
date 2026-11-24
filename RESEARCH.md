# Interactive drink-site research (Nov 2026)

Two research agents studied these sites: Celsius, SOLO Energy (Asahi, thirstcrusher.com.au), La Revoltosa, More Nutrition, Apple AirPods Pro, Lusion/Oryzo and Igloo Inc.

## Celsius (celsius.com)
**What works**
- Full-bleed campaign photography and video.
- Giant outlined "CELSIUS" wordmark behind a centred can.
- Numbered product carousel ("01–04 of 04").
- Science "proof" tabs with study summaries.
- A "Buy online" button pinned in a fixed corner.

**Stack:** WordPress, jQuery and bundled GSAP. About 4.9 MB transferred on load.

**Room for improvement**
- Cookie wall, country modal and an accessibility-widget button all cover the hero on first visit.
- The footer newsletter form is broken ("could not locate your form").
- The only h1 is "Home page".
- Accessibility depends on a bolt-on overlay rather than being built in.
- The homepage shows product lines, not flavours.
- Buying hands you off to Amazon.

## SOLO Energy (thirstcrusher.com.au)
**What works**
- Autoplaying campaign video in the hero.
- **Pinned flavour stepper:** the headline stays fixed while each scroll step swaps in the next can and name, with a progress rail.
- A dark, single-accent "Energy" section with lightning behind the can.
- Cheeky, distinctive copy.
- Respects `prefers-reduced-motion`, and every image has alt text.

**Stack:** Next.js, GSAP ScrollTrigger and Motion. The cans are flat webp images; there is no 3D.

**Room for improvement**
- A discount popup with a reCAPTCHA appears as soon as the page loads.
- The page is about 10,000px tall, mostly scroll-jacked swaps.
- There's no "where to buy" for the drink itself.
- Six identical "Learn more" buttons in a row.
- The cans never rotate; the motion is image swapping, not real product movement.

## Best-in-class 3D references
- **La Revoltosa:** the same stack as PRIMO (Three.js, GSAP and Lenis). The bottle uses two refractive materials, and the hero text is rendered in the 3D scene so the bottle bends it. The studio says performance was a constant fight.
- **Apple AirPods Pro:** scroll-scrubbed image sequence on a pinned canvas. It was criticised for "scrolljacking" and CPU drain.
- **Lusion (Oryzo):** one live 3D hero object with inertial, physical-feeling motion, and the camera moving through real depth.
- **Igloo Inc (Site of the Year 2024):** particle and fluid simulation, WebGL text effects, and shaders compiled in the background to keep the first load fast.

## Ideas for PRIMO, by impact for the effort
1. A pinned flavour stepper (SOLO-style, but with the live 3D bottle) with an "01/04" progress rail and snap points.
2. One persistent buy CTA that names the flavour currently in view.
3. No overlays on load; a slim cookie bar only.
4. Condensation droplets on the bottle in a "cold" chapter (procedural normal map on the clearcoat).
5. Proof numbers with source lines (Celsius-style, but built in rather than bolted on).
6. A studio HDRI environment map for more realistic reflections on the bottle and foil.
7. Pause rendering when the canvas is offscreen, and pre-compile shaders before the first scroll.
8. Write the chosen flavour into the URL so a configured bottle can be shared.
