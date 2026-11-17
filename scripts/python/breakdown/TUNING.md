# Audio evidence tuning notes

`audio_config.py:AUDIO_TUNING` names the speech and rhythm hypotheses and their
reasons. These are not a calibration on real music. Synthetic perfect scores are
sanity checks; the coordinator's unseen voice-over-music and varied-timbre suite
remains the independent validation. Do not tune on its parameters or event times.

`BEAT_CONFIDENCE_MIN` is the shared publication/beat-generation gate.
`NO_INSTRUMENT_CONFIDENCE_CAP` is derived below that gate. No instrument support
or confidence below the gate produces null tempo, not a low-confidence BPM.
Abstention reasons are `no-audio` (absent/empty audio), `too-short` (insufficient
observation length), `no-pulses` (no lag or too few pulse proposals), and
`low-confidence` (proposals cannot certify a beat). The Arabic report text is
the same; missing detection is report-only and never a Style DNA invariant.
Published metrical alternatives need at least 0.5 of the best candidate's fit
score, in addition to their period relationship. This does not change the
primary candidate ranking or confidence calculation.

Harmonicity and pitch motion alone cannot distinguish an instrument from voice.
Possible/music-or-voice spans do not mask background bed or tempo measurements.
`spans` describes affirmative vocal-envelope evidence, including held vowels;
`backgroundSpans` is narrower when stationary material or a held note could be
music. Report time recall against the union of reviewed word ranges, and report
background exclusion coverage separately. A clip-duration coverage percentage
is not voice recall. Synthetic changing notes, vibrato, arpeggios and quiet
voice-over-bed tests are not a substitute for the coordinator's unseen set.
Background exclusion requires two resolved resonances, smoothing at least the
observed harmonic spacing to reject a high instrument's subharmonic alias.
Voiced notes sustained for at least 0.25 s within one semitone are ambiguous:
singing must not erase its accompaniment. The weaker SFX and possible-voice
spans are unchanged by these background-only requirements.
Spectral tilt can leave only one resolved resonance; it still needs multiple
harmonics and sustained independent evidence. A local vocal core may support
nearby harmonic phonemes, without allowing transcript text to grow the mask.
The stricter envelope test trades recall for protection against instrumental
music. Measure this loss explicitly; do not select its thresholds on own reels.
ASR cannot turn unsupported text into a voice mask. VAD remains default-off until
the coordinator measures DSP recall on unseen voice-over-music material.

An impact/sub boom placed on a kick pulse, with the same band, template and no
sufficient level contrast, is dropped by design by the inherited 1.8x pulse-level
rule. Its role is not identifiable from this mixture alone. A different timbre on
the same pulse is retained when it clears the joint transient acceptance rule.
Do not restore false tempo grids or lower these gates to make a benchmark pass.

Deferred exit conditions: batch 3 must evaluate transients under the union of
confirmed and possible speech, including word starts/consonants, and report FP
and FN per reel rather than treating confirmed spans as the sole veto. Batch 4
must reject a voice-only false bed while retaining melodic and sung music;
stationary vowels excluded from backgroundSpans remain an explicit risk.

## Transient evidence (SFX)

There is one reporting rule, independent of event TYPE:
(grade >= candidate_grade_min) AND (audible TOTAL-energy rise) AND
(local outside speech OR a valid speech-shape branch). There is no separate
11.36 grade gate. An unknown type (hit) is still an accepted event when this
rule passes; typeConfidence and the separate type-accuracy row express that
uncertainty. Existing speech guards and branches are retained, with tonal
requiring a line that is not voice-aligned. All speech exception values below
remain hypotheses, not calibrated facts. No value is selected by comparing
versions on the own reels. Real-audio checks occur once per reel, at the end.

### Nominal false-alarm arithmetic and its independence assumption

The grade reference is Student-t with nu=5: the smallest integer degrees of
freedom with a finite fourth moment. With q30=t.ppf(.30,5), q70=t.ppf(.70,5),
grade=(x-q30)/(q70-q30). Six bands and 16 kHz/hop 64 give 1500 band/frame trials
per second. A proposal budget B=2/s gives alpha=2/1500 and
G=(t.isf(alpha,5)-q30)/(q70-q30)=5.43590528. Frame correlation does not invalidate
the union bound on marginal exceedances; locally estimated quantiles and real
nonstationarity still make this a nominal model rather than a validated bound.

Assume, additionally, independence of the grade test, total +6 dB rise test and
speech-shape test under reference NOISE. Assume P(total rise)=.01 and
P(speech shape)=.20. Then the joint expected rate is 2*.01=.02/s for local
(no speech-shape requirement), and 2*.01*.20=.004/s under speech. Both are below
the declared .05/s budget. These probabilities and independence are explicit
hypotheses, not measured calibration. The tests share audio, so independence
is not guaranteed; phonemes are not stationary reference noise. This arithmetic
must not be presented as a guaranteed false-alarm rate on real recordings.

### Total-energy attack and quantization floor

+6 dB means RMS amplitude ratio 10**(6/20)=1.995262 and power ratio 3.981072.
Acceptance is after_total > attack_energy_rise * before_total. A single band's
rise never admits an event. Bands locate the attack and choose its features.
Outside speech, total energy is full-band waveform RMS; this resolves a real
short silence that a 32 ms FFT would smear across two close attacks. Under
speech, total energy sums ALL residual frequency bins. Its before level is
clamped to the measurement floor. A measured quiet waveform gap can establish
that floor even if FFT interpolation still contains the previous attack.

The prepared WAV is signed 16-bit PCM normalized by 32768. One LSB is 1/32768;
half an LSB is 1/65536=0.0000152587890625. epsilon is this measurement floor for
amplitude scales and before levels; power denominators use its square. We do
not infer arbitrarily large ratios from a 1e-8 pseudo-silence. This conservative
floor is a measurement limit, not a new loudness target.

### Speech, close events and pulse spectra

Speech time remains spans union possibleSpans. The existing local residual and
all four speech branches are retained. Tonal requires not voiceAligned; other
branch constants are unchanged. Residual noise fitting median-masks short
transients over the existing attack guard so adjacent clicks do not teach the
next one as speech. Merge tests residual-band valleys when raw voice bridges
the gap. Final non-maximum suppression uses integer analysis frames to merge
near-duplicate onsets without chaining across separate 40 ms attacks.

Pulse proximity only proposes a comparison. matches_pulse re-verifies spectral
bands even for recorded members. A median raw pulse spectrum prevents one-off
effects from teaching their own template. A new band or resolved line survives
by its own joint acceptance evidence, without exceeding 1.8x the kick. The 1.8x
contrast gate is only for a matching pulse component. Generic clipped-boundary
spectral checks replace the former initial-kick exception. A same-band,
same-template impact remains intrinsically ambiguous in the mixture.

### Reported effects, archived hypotheses and scoring

sound.sfx contains only accepted, reported effects. Failed proposals are saved
in sound.sfxCandidates with status=needs-confirmation, detection=candidate,
candidateReasons, diagnostics and original timing. They are not in effect F1,
hitsPerMinute, recipe effect counts or DNA. candidateSfxCount supplies the one
report line for possible weak sounds not listed; report markup is owned by the
other lane and is unchanged here. reportedSfxCount is the accepted count;
confirmedSfxCount remains a compatibility alias. Type uncertainty does not
remove an accepted event from its count, even when a type review is pending.

sfxCandidateRecall independently matches truth times to archived hypotheses,
one-to-one within the unchanged 0.15 s tolerance. It has no target, is not a
precision measure, and can overlap reported-event matches; the two recalls are
not additive. Legacy results without the archive are unmeasured for this row.
The accuracy Markdown generator explicitly announces this scoring scope.

All SFX parameters and their stated reasons:

| Name | Value | Reason |
|---|---|---|
| `prepared_sample_rate` | `16000` | The analysis PCM contract fixes the band/frame trial rate. |
| `frame` | `512` | 32 ms resolves effect bands while retaining short attacks. |
| `hop` | `64` | 4 ms separates close attacks without a 120 ms exclusion radius. |
| `boundary` | `None` | Use valid waveform windows instead of fabricating an edge discontinuity. |
| `bands_hz` | `(0, 180, 500, 1500, 3000, 5000, 8001)` | Separate bass, voice and bright transient evidence. |
| `context_sec` | `0.8` | Local background follows level changes, not the loudest hit in the reel. |
| `local_past_only` | `True` | A slow new effect cannot establish its own pre-attack noise floor. |
| `guard_sec` | `0.064` | Exclude an attack and its immediate neighbours from its background. |
| `floor_percentile` | `30` | A low local quantile resists isolated peaks. |
| `spread_percentile` | `70` | Interquantile spread gives a graded local noise scale. |
| `floor_scale` | `0.05` | A stable nonzero bed still contributes to the detection scale. |
| `cross_band_floor` | `0.01` | Reject inaudible FFT leakage relative to the local mixture floor. |
| `pcm_bits` | `16` | The prepared WAV contract uses signed 16-bit PCM. |
| `epsilon` | `1.52587890625e-05` | Half a normalized PCM LSB, derived below as the measurement floor. |
| `smooth_sec` | `0.004` | Smooth FFT/noise ripples without merging 40 ms clicks. |
| `false_peaks_per_sec` | `0.05` | Nominal joint-rule budget; no separate high-grade acceptance gate. |
| `total_rise_noise_probability` | `0.01` | Hypothesis: one percent of noise proposals pass total +6 dB rise. |
| `speech_shape_noise_probability` | `0.2` | Hypothesis: at most one fifth also pass independent speech shape. |
| `candidate_false_peaks_per_sec` | `2.0` | Exploratory candidates use a looser budget; they remain scored and reviewable. |
| `noise_degrees_freedom` | `5` | Heavy-tailed reference with finite variance and fourth moment; a hypothesis, not a fit. |
| `candidate_grade_min` | `5.435905279765269` | Derived below from the exploratory budget using the same model. |
| `grade_prominence` | `1.5` | Reject small ripples on an existing event. |
| `boundary_share` | `0.12` | Trace an event to the early rise and late decay. |
| `max_event_sec` | `2.2` | Sustained material without a decay is background, not a transient. |
| `merge_attack_sec` | `0.024` | Simultaneous band attacks belong to one physical event. |
| `restart_valley` | `0.4` | A fresh attack needs a real intervening energy valley across any band. |
| `attack_probe_sec` | `0.024` | Compare energy on both sides of the proposed rise. |
| `attack_rise_db` | `6.0` | An independent component must approximately double its RMS amplitude to confirm an attack. |
| `attack_energy_rise` | `1.9952623149688795` | Derived RMS ratio: 10 ** (attack_rise_db / 20), not a power ratio. |
| `speech_percentile` | `85` | Learn a speech envelope without isolated transient peaks. |
| `speech_noise_percentile` | `90` | Residual phonemes set a local noise scale outside the excluded attack. |
| `speech_past_only` | `True` | A new sustained effect must not teach its own vocal background. |
| `speech_stride` | `4` | Bound the cost of the speech envelope quantile calculation. |
| `speech_spread_hz` | `250` | Cover moving voice harmonics and formant skirts. |
| `speech_gain_percentile` | `90` | Adapt to syllable loudness without fitting a narrow effect tone. |
| `speech_margin` | `1.5` | Require residual evidence beyond the predicted vocal envelope. |
| `speech_gain_band_hz` | `(250, 3800)` | Estimate speech level inside its formant band. |
| `speech_model_band_hz` | `(75, 4500)` | Preserve bass and bright evidence outside the vocal model. |
| `speech_harmonic_share` | `0.8` | A multi-harmonic residual aligned to voice is still a syllable. |
| `speech_harmonic_peaks` | `3` | One narrow effect tone cannot be rejected as a vocal comb. |
| `speech_harmonic_width` | `0.12` | Allow pitch/FFT uncertainty around the vocal harmonic comb. |
| `speech_share_exponent` | `0.5` | Grade unexplained band power continuously rather than vetoing speech time. |
| `speech_model_error_share` | `0.1` | Small in-band residuals can be vocal-envelope prediction error. |
| `speech_outside_share` | `0.5` | A majority of novel energy outside voice can support a quiet effect. |
| `speech_plosive_sec` | `0.06` | Short in-band noise without independent timbre is an ambiguous consonant. |
| `speech_line_share` | `0.2` | A concentrated tonal residual is evidence distinct from broadband plosives. |
| `speech_tonal_share` | `0.65` | A distinct tone concentrates most novel power in one resolved line. |
| `speech_click_attack_sec` | `0.012` | An effect click rises faster than sustained frication. |
| `speech_click_duration_sec` | `0.04` | Longer bright noise remains an ambiguous speech consonant. |
| `speech_sweep_sec` | `0.2` | A broadband sweep needs sustained independent motion across bands. |
| `speech_sweep_bands` | `3` | A lone sibilant band is insufficient evidence for a sweep. |
| `bridge_growth_ratio` | `2.0` | A gradual cross-band sweep must not contain a fresh impulsive reset. |
| `feature_hop` | `128` | 8 ms feature envelope retains the existing time resolution. |
| `feature_lookback_sec` | `1.2` | Include the rise of slow effects before the proposal peak. |
| `feature_ahead_sec` | `1.6` | Observe long attacks and decay rather than only 170 ms. |
| `feature_pre_sec` | `0.4` | Baseline precedes the event, not its energy peak. |
| `feature_filter_order` | `3` | Measure an effect envelope without unrelated bass beats. |
| `feature_attack_sec` | `0.064` | Positive attack spectrum identifies the event's dominant band. |
| `broadband_flatness` | `0.3` | Broadband effects need their full-band envelope, not one noisy bin. |
| `riser_attack_sec` | `0.4` | A riser needs a sustained build, separate from timestamp matching. |
| `riser_centroid_ratio` | `1.2` | Rising spectral energy distinguishes a riser from a slow whoosh. |

## Sustained bed evidence

A bed is sustained non-percussive MUSIC under the reel; tempo is separate.
Confirmed voice, sung or spoken, is NEVER positive bed evidence. A confirmed
sung/spoken line over a measured beat without sustained non-voice music gives
`present=null`: singing cannot be separated from talking over a beat here. The
bed caller forwards only whether a beat was measured, without changing tempo.
A quiet independent non-voice pad under confirmed voice can still establish a bed.

R1: reported effects AND weak candidates exclude their attack and falling tail.
A tail ends at the FIRST of: return to baseline, the first `note_window_sec`
window that falls by less than `tail_return_db`, or attack + `max_event_sec`.
The existing SFX maximum (2.2 s) is reused, not retuned for a reel. No usable
pre-event baseline means the lowest envelope over the following capped interval,
not an assumed silent floor. A genuinely falling 1.5 s ding remains excluded.
On a plateau no extra trailing pad is added: non-falling music is not a tail.
The pre-onset uncertainty pad stays unchanged. Short masked attacks are missing
observations: the existing note-gap bridge may connect evidence across them,
but excluded/confirmed-voice frames NEVER enter the positive numerator.

R2: direct evidence is `voice_gap & clean`. `possibleSpans` alone cannot close
it. Their observable fraction is saved as `possibleVoiceFraction`; no ASR text
creates positive music evidence. In confirmed-voice time, only separated held
non-voice harmonic series may provide evidence. FFT resolution/comb separation
remain hypotheses, not a calibrated source separator. Existing high-register
instruments that the upstream primitive confirms as voice can still abstain;
the original positive expectations remain in the tests to expose that failure.

R3: a bed needs at least `min_material_sec` AND `coverage >= coverage_min`.
Coverage is music-supported observable frames / all observable frames, where
observable = direct non-voice frames OR frames eligible for the independently
separated harmonic residual, excluding tails. It is not divided by all clean
frames (which include raw confirmed voice), nor by positive detections only.
`observableSec` records this denominator. A single isolated note or scattered
residue cannot certify a bed across a reel. Lack of steady residual lines can
support absence under speech with low confidence; genuinely insufficient evidence
still gives null. Null remains a scoring miss against a known false truth.
The confidence comparison uses continuous 1 s versus 6 s pads; the former
isolated 1 s pad inside a 6 s reel is now explicitly a continuity-gate negative.

### Minimum observable share (regression guard)

A bed sits under the reel. Less than a quarter observable does not represent the
remainder: `present=true` also requires `observable.mean() >= 0.25`. This is a
hypothesis, not a guarantee of representativeness. For nonempty but thin evidence,
compare `median(total[observable])` with `median(total[~voice_gap])`. Residue at
least 30 dB below speech supports `false` ONLY if no steady residual line lasts
`line_hold_sec` (0.5 s); a longer steady line requires `null`, even below 30 dB.
Absence is capped at `residual_absence_score_max`;
otherwise abstain (`null`). The 30 dB boundary is a hypothesis about masked vocal
residue/noise and may miss extremely quiet music; it is not a calibrated music
loudness standard. No speech reference means no invented level comparison.
Zero observable frames retain the established vocal-only residual absence or
abstention path, without evaluating an undefined median. All non-present scores
are capped, including absences from the older residual path. Evidence records
`observableShare` and, when comparable, `observedBelowSpeechDb`.

Observability uses the actual STFT measurement footprint: NFFT=1024 samples at
16 kHz covers four HOP=256 cells. `frame_times` places the measurement at the
window end minus half a hop, so the three preceding hop cells belong to its
footprint. Independently separated evidence may make those cells observable ONLY
where a residual line actually exists and no effect tail excludes it. They do
not directly seed music support; the existing note-continuity bridge remains
separate. This corrects single-instant accounting when applying the new share
gate without lowering 0.25 or counting raw confirmed voice as music evidence.

Known limitation: high-register vibrato at 660 Hz and arpeggios at 4/6 Hz over a
kit can be confirmed as voice by the current DSP detector (octave/formant
ambiguity). Their positive bed expectations remain in three separate
`unittest.expectedFailure` tests. Voice confirmation and tempo preconditions run
in `setUp`, outside expectedFailure, so unrelated failures remain real failures.
The current `bed.present is None` outcome is also pinned in setUp, outside
expectedFailure, so a drift to false is a real failure. Only the positive bed
assertion is expected to fail.
The ordinary changing-note high-register case and the confirmed sung-line case
remain passing tests. The limitation is also exposed in breakdown `limitations`
when confirmed voice is reported. The voice detector is not changed here.

The current own set has no true music beds: it checks absence, not music recall.
Synthetic and unseen voice-over-music cases remain necessary positive validation.

Observable harmonic bins must hold their level locally and dominate percussion.
Short note boundaries may bridge only inside observable intervals. Stable music
can move between frequencies; evidence accumulates over held note material.
Broadband noise alone is insufficient musical evidence. Confidence is an
uncalibrated evidence score derived from material duration, stability and its
coverage of time outside voice/effects. It is no longer a fixed score for a
boolean result. Available time, sustained time, coverage and stability are saved
in bed.evidence. No project identity, tempo or truth annotation drives the rule.

Bed hypotheses (including their limits on quiet/atonal/fading music):

| Name | Value | Reason |
|---|---|---|
| `min_available_sec` | `0.5` | Less than half a second cannot establish sustained background. |
| `min_available_fraction` | `0.05` | Tiny isolated gaps do not describe an otherwise excluded reel. |
| `note_window_sec` | `0.12` | Distinguish held note material from a short attack/decay. |
| `min_material_sec` | `0.5` | Sustained music needs accumulated evidence, not a ringing frame. |
| `coverage_min` | `0.5` | A bed occupies at least half of observable non-voice/tail time. |
| `observable_share_min` | `0.25` | Less than a quarter observable cannot represent the rest of a reel; hypothesis. |
| `residue_below_speech_db` | `30` | Thin residue far below speech supports low-confidence absence; hypothesis, not a music loudness standard. |
| `close_gap_sec` | `0.12` | Permit brief note boundaries and percussion over a continuous bed. |
| `stable_span_db` | `6.0` | A decaying pulse changes much more than 6 dB over a note window. |
| `low_percentile` | `20` | Ignore isolated noisy frames when checking note stability. |
| `high_percentile` | `80` | Compare robust upper/lower levels rather than maxima. |
| `harmonic_share` | `0.62` | Existing non-percussive evidence threshold, now only one feature. |
| `flatness_max` | `0.3` | Broadband noise alone is insufficient musical evidence. |
| `confidence_full_sec` | `2.0` | Four minimum-length observations provide duration confidence. |
| `tail_pre_sec` | `0.4` | Estimate background before the effect, independently of its peak. |
| `tail_return_db` | `3.0` | A tail returns when it is within 3 dB of its prior background. |
| `tail_quiet_sec` | `0.05` | Require sustained return rather than one oscillatory minimum. |
| `event_pad_sec` | `0.05` | Cover onset/frame uncertainty at the effect boundary. |

## Temporally coherent local cuts

Global thresholds are unchanged. Multi-scale tile novelty proposes spatial
regions; actual changed pixels refine their bounds. Lab thumbnails retain colour
swaps that grayscale cannot see. A replacement must occur at its adjacent-frame
boundary and its region must hold on both sides. Continuous camera motion does
not concentrate most endpoint change at one frame. Sparse displacement now needs
this same evidence, rather than allowing a moving sticker/title to stand alone.

Changed interior distinguishes a small picture from thin glyph changes. Tall
linework can be a character. Internal edge geometry and low texture reject short
caption/highlight boxes; a blank picture panel's outer frame is not text geometry.
These are conservative geometric hypotheses, not OCR or semantic identification:
small low-texture icons or large text can remain ambiguous. Synthetic negatives
cover repeated captions, same-text highlights and slow camera movement. The own
cartoon negative set is checked once at the end, never used to choose values.
Whole-frame candidates retain the existing path and are de-duplicated by frame;
a coherent local hard edge is not also labelled as its surrounding gradual motion.

Recognized fades/dissolves/slides are protected before local edges can split
them. Unclassified motion can still contain a coherent hard local edge. The
existing sparse-displacement jump classification is preserved.

Visual hypotheses:

| Name | Value | Reason |
|---|---|---|
| `analysis_width` | `64` | Compact Lab thumbnails retain chroma swaps without storing full colour frames. |
| `tile_widths` | `(4, 8, 16)` | Coarse-to-fine spatial proposals catch different region sizes. |
| `pixel_delta` | `25` | Preserve the existing approximately ten-percent pixel-change scale. |
| `cell_change_min` | `0.1` | At least a tenth of a proposal tile must change. |
| `novelty_ratio` | `2.5` | A swap must stand out from surrounding motion, as in the global scout. |
| `context_sec` | `0.3` | Observe holding content on both sides of a proposed boundary. |
| `hold_sec` | `0.12` | Several frames must support each side, not a one-frame flash. |
| `abrupt_share` | `0.7` | Most endpoint change must occur at the actual boundary, not across a pan. |
| `hold_error_share` | `0.25` | Within-side drift must be small relative to replacement content. |
| `min_area` | `0.0025` | A region below one four-hundredth of the canvas is unresolved here. |
| `group_kernel` | `3` | Connect adjacent changed strokes without spanning distant regions. |
| `dense_interior_share` | `0.12` | A small picture has changed interior, not only thin text strokes. |
| `linework_height` | `0.2` | Tall coherent linework can be a character despite a sparse interior. |
| `linework_aspect` | `1.5` | Wide shallow stroke clusters are more consistent with a text line. |
| `edge_low` | `50` | Canny hysteresis lower contrast boundary for persistent geometry. |
| `edge_high` | `150` | Canny hysteresis upper contrast boundary for persistent geometry. |
| `same_edges_share` | `0.9` | Highlight/colour-only changes preserving text geometry are negatives. |
| `edge_border_px` | `3` | A picture's outer frame is not internal text geometry. |
| `texture_entropy_min` | `3.0` | Eight effective luminance levels separate picture texture from flat glyph boxes. |
| `text_line_aspect` | `3.0` | A shallow flat strip is more likely a title/highlight than a picture panel. |
| `protected_gradual_kinds` | `('fade', 'flash', 'dissolve', 'slide', 'whip')` | A recognized transition is not a sequence of local hard edges. |
| `gradual_endpoint_score` | `0.35` | Preserve the existing endpoint criterion before protecting a gradual interval. |

### Fix-round evidence and limitations

Every value in `visual_config.py` above is a **hypothesis, not calibration**.
Local confidence is now `sqrt(ratio_strength * hold_strength)`, with
`ratio_strength = clip((boundaryRatio - abrupt_share)/(1-abrupt_share),0,1)`
and `hold_strength = clip(1-holdErrorShare/hold_error_share,0,1)`.
The measured boundary ratio and hold error travel with each local cut as
`evidence`. This is an evidence strength, not an empirical probability.

At merge, an OCR start/end within `CUT_TEXT_TUNING.boundarySec = 0.1`
seconds moves a region cut into `cutCandidates` ONLY when
`area(cut box intersect text box) / area(cut box) >= containmentMin = 0.9`.
Other regional cuts remain in `cuts`. Candidates retain their timestamp/box and
caption evidence, with low confidence, needs-confirmation and no shot boundary.
They are archived for report inspection, excluded from cut scores, pace, anchors
and DNA. The report field is `cutCandidates`; `captionEvidence` records the OCR
text ID and containment. The original cut ID is retained, without collisions.

**Narrow-margin hypothesis, n = 7:** the supplied regression table has synthetic
containment approximately 0.90-1.0, and own true cuts at most about 0.80. The
separating margin is small and this is not independent validation. The threshold
may confuse real picture replacements with large OCR boxes or miss captions
whose OCR boxes are too small. Keeping candidates instead of deleting them
preserves the evidence. Missing OCR remains a possible text false positive.
Region cuts still do not split shots/camera analysis; partial-swap precision
inside a scene is not measured by the current own truth.

Additional bed hypotheses:

| Name | Value | Reason |
|---|---|---|
| `line_hold_sec` | `0.5` | Require a contiguous held line, not a brief vocal or note boundary. |
| `independent_series_min` | `2` | One harmonic comb can be a vowel; an independent second fundamental supports music. |
| `line_sample_sec` | `0.1` | Bound comb-fitting cost below the sustained-line time scale. |
| `line_neighbours` | `5` | Local frequency median separates a line from broadband floor. |
| `voicing_series_peaks` | `3` | Two peaks alone cannot establish a vocal harmonic comb. |
| `voicing_series_density` | `0.5` | Avoid explaining unrelated sparse notes with an arbitrary subharmonic. |
| `voicing_max_gap_orders` | `4` | Permit missing formant-weakened harmonics, with bounded comb proposals. |
| `residual_absence_score_max` | `0.49` | Absence inferred under speech is explicitly below medium confidence. |

## Execution and memory budget (batch 5)

The seven JSON analysers use one job-local Python process. Sampling cadence and
result contracts stay unchanged. OpenCV RNG is reset before each command.
There is NO frame spool or optional frame store: iter_frames grabs sequentially
and retrieves BGR only for requested frame indices/intervals. A 90 s, 60 fps,
540x960 proxy writes zero extra frame bytes, instead of 8,398,080,000 bytes.
Compressed proxy, JSON, logs and report stills still need their ordinary space.
The 90 s sampling test forbids temporary frame creation and checks 180 selected
retrievals at 2 fps out of 5400 frames. Existing analyser feature/cue arrays remain;
removing the spool is not a claim that the whole analyser heap is constant.

The one cold cartoon-demo A/B keeps the worker, overlap and the OLD thread budget:
84.960 s with store (previous batch) versus 79.136 s without it, 6.85% less wall
with no store. This is one observation, not an independent performance distribution.
The absolute difference is below 10%, so frame_store.py and its store-specific
test were deleted. Default disk exhaustion from BGR spooling is eliminated rather
than masked by a capacity estimate. Future disk writes for necessary outputs can
still fail normally if their storage is unavailable.

### Dynamic budget

For C available logical cores, ASR=min(4,C). During real ASR,
vision=clamp(floor(0.6*C)-ASR,1,max(1,ASR-1)); pool=2 only when C>5.
This gives vision 1/1/1/3/3 on 4/5/8/12/16 logical cores. When ASR is off,
digitally silent or cached, vision=C and pool=1. On <=5 cores ASR and picture
work are serialized, with full vision after ASR finishes. The worker is
configured exactly once after the ASR decision. The speech analyser is first
in the picture chain, inside overlap; ASR receives a deferred voice getter.
Voice evidence is read after transcription, preserving the existing limitations
and defensive plain-ASR retry. Cached and failing preflights cannot deadlock the
getter because the picture chain produces voice evidence before awaiting that
decision. Low-core hosts defer ASR until that evidence is ready.

This budget is a HYPOTHESIS from two measured cartoon-demo points, not a general
CPU law: vision=2 gave ASR 57.505 s/wall 79.136 s; vision=7 gave ASR 79.019 s/wall
90.545 s. The coordinator also measured cartoon-11 ASR 190.5 -> 243.2 s with the
larger budget. Shared cache/power contention
is a possible explanation, not a measured causal model. The clamp protects the
ASR critical path while allowing overlap; all cores remain available without ASR.

OCR intra-op=vision, inter-op=1; OpenCV and its FFmpeg capture use vision.
NumPy/BLAS is single-threaded from startup. Worker OCR intra/inter-op pools park
when idle, so detector and recognizer pools do not spin against ASR. Standalone
OCR defaults are unchanged. No physical-core/SMT guess or priority change is used.

Core count and pool/thread configuration are NOT breakdown identity inputs and
are ignored by the unchanged-input comparison. The execution-only JS module is
not an analysis-code fingerprint input. Changing cores alone must reuse the
stored breakdown without force or replacing manual review. Per-analyser caches
retain only numeric CV/ONNX thread limits because parallel floating reductions
can differ; pure single-threaded DSP excludes them. Timing records the actual
budget. The ASR chunk/model/options identity remains unchanged.

The speech background rank-filter window is clamped to the largest odd count
not exceeding the available frames (at least one), capped by background_frames.
For every existing reel the old 51-frame window is unchanged. Explicit 0.2 s and
0.9 s tests guard against the native SciPy access violation on oversized windows.

### Ownership, cleanup and cancellation

The reference lease encloses all worker activity. Startup removes leftover
worker-* directories only beneath that lease's workDir, without following
symlinks; unrelated directories are preserved. Normal and aborted workers finish
cleanup before ownership is released. SIGINT/SIGTERM and API AbortSignal stop
Whisper, the Python worker and the presenter's FFmpeg decoder. The face detector
itself retains the editing pipeline's native defaults: threads here limits only
FFmpeg, NOT the native face inference. Cancellation waits for an in-flight face
measurement to finish, then throws before publication and releases the lease.
No instant face cancellation or face inference thread cap is claimed.

Only ASR captions may change between execution snapshots. Other implementation,
model/runtime and source identity changes are rejected. Original and prepared
proxy/PCM hashes are checked before publication. No partial breakdown is published
on failure. The editing pipeline's default FFmpeg arguments remain unchanged.

OCR keeps model-local SHA256 caches for 128 full-frame readings and 512 line
crops. Shape, dtype and every input byte participate in identity; any difference
reruns inference. Cached mutable readings are copied. The refinement pass keeps
only needed boundary/midpoint windows and complete list-highlight intervals.

Whisper chunk length, overlap, VAD and encoder calls remain unchanged. No unproved
stateful/multi-file batching is enabled. On the earlier cartoon-demo baseline,
two model loads took 2.347 s versus 48.778 s encoding; init amortization remains
unimplemented. Changing chunk/window semantics would reopen the rejected parity
gate. ASR thread count on 2/3-core hosts can differ from the editing default of
four and has its own cache identity.

### Fix-round-2 cold observation and optional lever

The single cartoon-11 cold check after the budget/getter/identity/short-audio
changes measured wall 304.687 s (309.33 s/60), ASR 271.190 s, picture speech
7.301 s and prepare 11.756 s. The budget hypothesis above did NOT meet the target
on this run; it must not be presented as a general speedup. ASR alone exceeds the
236.4 s wall allowance for a 59.1 s reel. The physical reason for the slowdown is
not measured; power/shared-cache contention remains an inference only.

The optional early-wav lever is NOT enabled. With the measured stage costs held
fixed, hiding all preparation would still leave 292.931 s. Safe early execution
also needs reference-lease/cancellation ownership before ASR and a partial
prepare lifecycle: the current preparer validates/publishes proxy and wav before
returning, and unknown video duration is resolved from the proxy before wav
alignment. That lifecycle change is not proved safe and byte-identical in this
last round. No ASR model, chunking, output, target or tolerance was changed to
mask the MISS. The synthetic bpm96-dry cold check was 25.745 s; both breakdowns
and the cartoon-11 captions were strictly identical to the stored pre-batch
results after excluding only the analysis timestamp.
