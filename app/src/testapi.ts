import { Compositor } from './engine/compositor';
import { EFFECTS } from './engine/effects';
import { TRANSITIONS } from './engine/transitions';
import { SCENES, Scene3DRenderer } from './engine/scene3d';
import { MOTIONS } from './engine/motion';
import * as tl from './engine/timeline';
import * as ty from './engine/types';
import { exportProject } from './engine/exporter';
import { Player } from './engine/player';
import { detectBeats } from './auto/beat';
import * as analyze from './auto/analyze';
import * as media from './store/media';
import { db } from './store/db';

(window as unknown as { __t: unknown }).__t = { Compositor, EFFECTS, TRANSITIONS, SCENES, Scene3DRenderer, MOTIONS, tl, ty, exportProject, Player, detectBeats, analyze, media, db };
