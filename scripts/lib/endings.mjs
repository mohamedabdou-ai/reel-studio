import {findSignoffSec} from './auto-cut.mjs';






export function resolveEnding({creator, words, signoffFromSec}) {
  const ending = {...creator.ending};
  const notices = [];
  let at = null;
  if (ending.signOff !== null) {
    at = Number.isFinite(signoffFromSec) ? signoffFromSec : findSignoffSec(words, ending.signOff);
    if (at === null) {
      notices.push(`The recorded sign-off «${ending.signOff}» is not in this video's transcript, so the sign-off is off for this video.`);
      ending.signOff = null;
    }
  } else if (Number.isFinite(signoffFromSec)) {
    notices.push('signoffFromSec was ignored: the recorded sign-off is off in the profile.');
  }
  return {creator: {...creator, ending}, signoffFromSec: at, notices};
}

const ENDING_FAMILIES = ['comment', 'follow', 'creator-cta'];


export function endingIssues(manifest) {
  if (!manifest.creator) return ['Delivery needs the creator profile.'];
  const {handle, ending} = manifest.creator;
  const scenes = manifest.scenes;
  const last = scenes.at(-1), prior = scenes.at(-2);
  const cta = ending.cta !== null, follow = ending.followCard, signOff = ending.signOff !== null;
  const issues = [];
  const keyword = (scene) => { if (scene.data.keyword !== ending.cta) issues.push(`The comment CTA keyword must be «${ending.cta}».`); };
  const followHandle = (scene) => { if (scene.data.handle !== handle) issues.push(`The follow card must show the complete profile handle ${handle}.`); };
  const present = (family) => scenes.some((scene) => scene.family === family);
  if (cta && follow) {
    if (last?.family === 'creator-cta') {
      keyword(last);
      followHandle(last);
      if (!(last.data.followFrame > 0 && last.data.clickedFrame > last.data.followFrame && last.data.clickedFrame < last.durationInFrames)) {
        issues.push('Creator CTA needs comment, follow and click in order.');
      }
    } else if (prior?.family === 'comment' && last?.family === 'follow') { keyword(prior); followHandle(last); }
    else issues.push('The ending needs the comment CTA scene and then the follow card as the last two scenes.');
  } else if (cta) {
    if (last?.family === 'comment') keyword(last);
    else issues.push('The ending needs the comment CTA scene as the last scene.');
    if (present('follow') || present('creator-cta')) issues.push('The follow card is off in the profile; remove the follow scene.');
  } else if (follow) {
    if (last?.family === 'follow') followHandle(last);
    else issues.push('The ending needs the follow card as the last scene.');
    if (present('comment') || present('creator-cta')) issues.push('No CTA keyword was chosen for this video; remove the comment CTA scene.');
  } else if (scenes.some((scene) => ENDING_FAMILIES.includes(scene.family))) {
    issues.push('The CTA and the follow card are both off for this video; remove the ending scenes.');
  }
  if (signOff) {
    if (!Number.isInteger(manifest.signoffFromFrame)) issues.push('The recorded sign-off is on, so the manifest needs signoffFromFrame.');
    else if (scenes.some((scene) => scene.fromFrame + scene.durationInFrames > manifest.signoffFromFrame)) issues.push('Every scene must finish before the recorded sign-off.');
  } else if (manifest.signoffFromFrame !== undefined) {
    issues.push('The sign-off is off for this video, so the manifest must not keep signoffFromFrame.');
  }
  return issues;
}
