# SCg UI Component

This project aims to make a universal library for visualizing and editing SCg code. It is based on the editor built into [sc-web](https://github.com/ostis-ai/sc-web) and is a successor to the component integrated into the sc-web.

## Goals

- Create a universal library for visualizing and editing SCg
- Provide a UI component for any ostis-system that would need SCg as a part of the UI
- Ease the maintenance of SCg and decouple it from updating the sc-web

## Tech stack and requirements

- Typescript for making it easier for developers to follow the codebase
- Use the least possible amount of dependencies to keep the component slim and fast
- The component has to have a stable and thought-out API for integrations
  - callbacks for event handling
    - editing events
    - on-render
    - navigation
    - context menu
  - style customizations
  - ts-sc-client connection sharing with the parent UI
  - options customizations
    - editing mode
    - context menu
    - navigation
    - 3D mode
    - additional hooks for scene render

## Current state

- [ ] Create a test rig for faster developer feedback loop
- [x] Object model is backported from sc-web
- [x] SCg SVG alphabet is backported from sc-web
- [x] Math functions are backported from sc-web
- [ ] SCg layout is backported from sc-web
  - [x] Rewritten in typescript
  - [ ] New version of d3.js and the force layout algorithms tested
- [ ] SCg Render is backported from sc-web
  - [x] Rewritten in typescript
  - [ ] Depends on the sandbox
- [ ] Content searchers are backported from sc-web
  - [ ] Rewritten in typescript
  - [ ] Depends on the sandbox
- [ ] Visualization "sandbox" is implemented for sc-links and sc-structs (.pdf, .html, SCg, media, etc.)
  - NOTE: This has to be a dynamic feature with sandbox implementations registration (preferably through the knowledge base). That depends heavily on the UI components interpreter and subject area of UI components, and this is not yet implemented. The main reason for a development freeze at the moment.
- [ ] Editor is implemented
  - [ ] Editor commands are implemented
  - [ ] Command manager is implemented
  - [ ] All jQuery calls are replaced
  - [ ] Depends on the sandbox
- [ ] Component API (depends on component interpreter and subject area of UI components)
- [ ] SCg struct is backported from sc-web
- [ ] .gwf logic implemented in a separate library
- [ ] Rewrite sc-web server calls to use ts-sc-client
  - [ ] (Optional) backport these changes to sc-web

## Functionality

- [ ] Getting a semantic neighborhood from sc-machine
- [ ] Saving scene changes to sc-machine
- [ ] Context menu for scene elements
- [ ] Element creation, deletion, selection, and movement
- [ ] Выделение множества элементов
- [ ] Rendering a scene from .gwf (should probably use a .gwf parser that will become a separate library)
- [ ] Save a scene to .gwf (see above)
- [ ] Scene interaction buttons and help materials (such as hover popups) should be sourced from the knowledge base
- [ ] Every element of the interface has to have a corresponding sc-element on which you can ask questions (semantic interface features)
