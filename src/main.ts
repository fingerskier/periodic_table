import './style.css';
import { buildModel } from './model';
import { SceneApp } from './scene/app';
import { createStore, initialState } from './state';

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const store = createStore({ ...initialState(buildModel('Lu').layers), autoRotate: !reduceMotion });
const scene = new SceneApp(document.getElementById('stage')!, store);

// Debug/test handle (used by scripts/e2e.mjs).
(window as unknown as { __pc: unknown }).__pc = { store, scene };
