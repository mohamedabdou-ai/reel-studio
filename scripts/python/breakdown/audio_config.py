"""Named hypotheses for audio evidence; validation is not a calibration claim."""

AUDIO_TUNING = {
    "bed": {
        "line_hold_sec": .5,  # Separate a persistent non-voice residual under confirmed voice.
        "independent_series_min": 2,  # One vocal comb cannot establish independent music under confirmed voice.
        "line_sample_sec": .1,  # Inspect persistent spectra at a bounded cadence, finer than the hold interval.
        "line_neighbours": 5,  # A Hann-resolved line must stand above adjacent spectral background.
        "voicing_series_peaks": 3,  # Two unrelated pad notes cannot alone define a vocal comb.
        "voicing_series_density": .5,  # Missing alternate orders alone do not establish a vocal fundamental.
        "voicing_max_gap_orders": 4,  # Permit missing harmonics across formant valleys.
        "residual_absence_score_max": .49,  # Indirect absence under speech stays low-confidence.
        "min_available_sec": .5,  # Less than half a second cannot establish sustained background.
        "min_available_fraction": .05,  # Tiny isolated gaps do not describe an otherwise excluded reel.
        "note_window_sec": .12,  # Distinguish held note material from a short attack/decay.
        "min_material_sec": .5,  # Sustained music needs accumulated evidence, not a ringing frame.
        "coverage_min": .5,  # A bed occupies at least half of observable non-voice/tail time.
        "observable_share_min": .25,  # Less than a quarter of the reel cannot represent a bed under its remainder; hypothesis.
        "residue_below_speech_db": 30.,  # Thin residue this far below speech supports low-confidence absence; hypothesis.
        "close_gap_sec": .12,  # Permit brief note boundaries and percussion over a continuous bed.
        "stable_span_db": 6.,  # A decaying pulse changes much more than 6 dB over a note window.
        "low_percentile": 20,  # Ignore isolated noisy frames when checking note stability.
        "high_percentile": 80,  # Compare robust upper/lower levels rather than maxima.
        "harmonic_share": .62,  # Existing non-percussive evidence threshold, now only one feature.
        "flatness_max": .3,  # Broadband noise alone is insufficient musical evidence.
        "confidence_full_sec": 2.,  # Four minimum-length observations provide duration confidence.
        "tail_pre_sec": .4,  # Estimate background before the effect, independently of its peak.
        "tail_return_db": 3.,  # Minimum fall per note window and tolerance on return to background.
        "tail_quiet_sec": .05,  # Require sustained return rather than one oscillatory minimum.
        "event_pad_sec": .05,  # Cover onset/frame uncertainty at the effect boundary.
    },
    "sfx": {
        "prepared_sample_rate": 16000,  # The analysis PCM contract fixes the band/frame trial rate.
        "frame": 512,  # 32 ms resolves effect bands while retaining short attacks.
        "hop": 64,  # 4 ms separates close attacks without a 120 ms exclusion radius.
        "boundary": None,  # Use valid waveform windows instead of fabricating an edge discontinuity.
        "bands_hz": (0, 180, 500, 1500, 3000, 5000, 8001),  # Separate bass, voice and bright transient evidence.
        "context_sec": .8,  # Local background follows level changes, not the loudest hit in the reel.
        "local_past_only": True,  # A slow new effect cannot establish its own pre-attack noise floor.
        "guard_sec": .064,  # Exclude an attack and its immediate neighbours from its background.
        "floor_percentile": 30,  # A low local quantile resists isolated peaks.
        "spread_percentile": 70,  # Interquantile spread gives a graded local noise scale.
        "floor_scale": .05,  # A stable nonzero bed still contributes to the detection scale.
        "cross_band_floor": .01,  # Reject inaudible FFT leakage relative to the local mixture floor.
        "pcm_bits": 16,  # The prepared WAV contract uses signed 16-bit PCM.
        "epsilon": None,  # Half a normalized PCM LSB, derived below as the measurement floor.
        "smooth_sec": .004,  # Smooth FFT/noise ripples without merging 40 ms clicks.
        "false_peaks_per_sec": .05,  # Nominal joint-rule budget; no separate high-grade acceptance gate.
        "total_rise_noise_probability": .01,  # Hypothesis: one percent of noise proposals pass total +6 dB rise.
        "speech_shape_noise_probability": .2,  # Hypothesis: at most one fifth also pass independent speech shape.
        "candidate_false_peaks_per_sec": 2.,  # Exploratory candidates use a looser budget; they remain scored and reviewable.
        "noise_degrees_freedom": 5,  # Heavy-tailed reference with finite variance and fourth moment; a hypothesis, not a fit.
        "candidate_grade_min": None,  # Derived below from the exploratory budget using the same model.
        "grade_prominence": 1.5,  # Reject small ripples on an existing event.
        "boundary_share": .12,  # Trace an event to the early rise and late decay.
        "max_event_sec": 2.2,  # Sustained material without a decay is background, not a transient.
        "merge_attack_sec": .024,  # Simultaneous band attacks belong to one physical event.
        "restart_valley": .4,  # A fresh attack needs a real intervening energy valley across any band.
        "attack_probe_sec": .024,  # Compare energy on both sides of the proposed rise.
        "attack_rise_db": 6.,  # An independent component must approximately double its RMS amplitude to confirm an attack.
        "attack_energy_rise": None,  # Derived RMS ratio: 10 ** (attack_rise_db / 20), not a power ratio.
        "speech_percentile": 85,  # Learn a speech envelope without isolated transient peaks.
        "speech_noise_percentile": 90,  # Residual phonemes set a local noise scale outside the excluded attack.
        "speech_past_only": True,  # A new sustained effect must not teach its own vocal background.
        "speech_stride": 4,  # Bound the cost of the speech envelope quantile calculation.
        "speech_spread_hz": 250,  # Cover moving voice harmonics and formant skirts.
        "speech_gain_percentile": 90,  # Adapt to syllable loudness without fitting a narrow effect tone.
        "speech_margin": 1.5,  # Require residual evidence beyond the predicted vocal envelope.
        "speech_gain_band_hz": (250, 3800),  # Estimate speech level inside its formant band.
        "speech_model_band_hz": (75, 4500),  # Preserve bass and bright evidence outside the vocal model.
        "speech_harmonic_share": .8,  # A multi-harmonic residual aligned to voice is still a syllable.
        "speech_harmonic_peaks": 3,  # One narrow effect tone cannot be rejected as a vocal comb.
        "speech_harmonic_width": .12,  # Allow pitch/FFT uncertainty around the vocal harmonic comb.
        "speech_share_exponent": .5,  # Grade unexplained band power continuously rather than vetoing speech time.
        "speech_model_error_share": .1,  # Small in-band residuals can be vocal-envelope prediction error.
        "speech_outside_share": .5,  # A majority of novel energy outside voice can support a quiet effect.
        "speech_plosive_sec": .06,  # Short in-band noise without independent timbre is an ambiguous consonant.
        "speech_line_share": .2,  # A concentrated tonal residual is evidence distinct from broadband plosives.
        "speech_tonal_share": .65,  # A distinct tone concentrates most novel power in one resolved line.
        "speech_click_attack_sec": .012,  # An effect click rises faster than sustained frication.
        "speech_click_duration_sec": .04,  # Longer bright noise remains an ambiguous speech consonant.
        "speech_sweep_sec": .2,  # A broadband sweep needs sustained independent motion across bands.
        "speech_sweep_bands": 3,  # A lone sibilant band is insufficient evidence for a sweep.
        "bridge_growth_ratio": 2.,  # A gradual cross-band sweep must not contain a fresh impulsive reset.
        "feature_hop": 128,  # 8 ms feature envelope retains the existing time resolution.
        "feature_lookback_sec": 1.2,  # Include the rise of slow effects before the proposal peak.
        "feature_ahead_sec": 1.6,  # Observe long attacks and decay rather than only 170 ms.
        "feature_pre_sec": .4,  # Baseline precedes the event, not its energy peak.
        "feature_filter_order": 3,  # Measure an effect envelope without unrelated bass beats.
        "feature_attack_sec": .064,  # Positive attack spectrum identifies the event's dominant band.
        "broadband_flatness": .3,  # Broadband effects need their full-band envelope, not one noisy bin.
        "riser_attack_sec": .4,  # A riser needs a sustained build, separate from timestamp matching.
        "riser_centroid_ratio": 1.2,  # Rising spectral energy distinguishes a riser from a slow whoosh.
    },
    "speech": {
        "hop": 320,  # 20 ms evidence cadence, independent of ASR token timing.
        "frame": 1024,  # 64 ms resolves low voice harmonics at 16 kHz.
        "pitch_min_hz": 75,  # Lower bound of the voiced-excitation search.
        "pitch_max_hz": 400,  # Upper bound of the voiced-excitation search.
        "band_low_hz": 250,  # Speech-band richness excludes bass-only ringing.
        "band_high_hz": 3800,  # Upper speech-formant analysis band.
        "peak_prominence": .012,  # Relative prominence for resolved harmonic peaks.
        "peak_distance_bins": 3,  # Avoid counting one broadened peak repeatedly.
        "strong_peaks": 4,  # Richness alone is insufficient without vocal formants.
        "weak_harmonics": 2,  # Weak cues keep ASR conservative, never erase music.
        "harmonic_tolerance": .16,  # FFT-bin uncertainty around an integer harmonic.
        "power_floor": 1e-14,  # Numerical activity floor, not a quiet-speech skip rule.
        "relative_activity": 1e-5,  # Reject numerical residue relative to this signal.
        "periodicity": .45,  # Require repeatable excitation before claiming voicing.
        "band_share": .15,  # Reject evidence consisting almost entirely of bass.
        "confidence_base": .45,  # Evidence score offset; not a posterior probability.
        "confidence_periodic": .35,  # Periodic excitation contributes to confidence.
        "confidence_band": .2,  # Speech-band energy contributes to confidence.
        "confidence_band_reference": .5,  # Saturate the band-energy contribution.
        "neighbour_frames": 10,  # About 0.4 s for local modulation evidence.
        "neighbour_min_frames": 3,  # Avoid variation decisions from a single frame.
        "syllable_prominence": .1,  # Ignore tiny envelope ripples.
        "syllable_min_hz": 3,  # Lower local syllabic-modulation band.
        "syllable_max_hz": 8,  # Upper local syllabic-modulation band.
        "pitch_cv": .015,  # Pitch motion is a weak cue, not proof of speech.
        "closing_frames": 5,  # Bridge short gaps only after frame evidence exists.
        "opening_frames": 4,  # Reject isolated harmonic attacks.
        "span_min_sec": .12,  # Require sustained evidence, not one spectral frame.
        "pad_before_sec": .04,  # Conservative leading evidence uncertainty.
        "pad_after_sec": .08,  # Conservative trailing evidence uncertainty.
        "mask_pad_sec": .1,  # Preserve the existing consumer mask padding.
        "formant_low_hz": 350,  # Exclude the fundamental from the formant test.
        "formant_min_peaks": 1,  # One resolved vocal resonance; spectral tilt can hide upper formants.
        "residual_formant_min_peaks": 2,  # Subtracted spectra need stronger evidence against note-change artifacts.
        "background_formant_min_peaks": 2,  # Erasing background needs stronger evidence than an SFX voice mask.
        "steady_note_sec": .25,  # A sustained note can be singing; do not erase its accompaniment.
        "steady_note_cents": 100,  # One semitone allows normal vibrato inside a sustained note.
        "formant_prominence": .05,  # Resonances must rise above the local envelope.
        "formant_smoothing_pitch": .75,  # Smooth the harmonic comb before finding formants.
        "formant_smoothing_min_hz": 80,  # Stable smoothing at the low pitch boundary.
        "background_frames": 51,  # About one second to identify stationary material.
        "background_share": .5,  # Music/held-tone ambiguity protects background measurements.
        "neural_speech": .75,  # Strong optional Speech-class vote, independent of ASR.
        "weak_scale": .5,  # Keep possible evidence below confirmed evidence.
        "weak_cap": .49,  # Possible voice cannot independently become a hard mask.
        "asr_window_sec": .12,  # ASR can corroborate a nearby independent span only.
        "asr_boost": .1,  # Corroboration raises confidence without inventing spans.
    },
    "rhythm": {
        "min_beat_confidence": .3,  # Publication and beat generation share this evidence gate.
        "unsupported_cap_gap": .01,  # No-instrument confidence stays strictly below that gate.
        "background_back_frames": 18,  # Estimate pre-attack spectral background.
        "background_guard_frames": 4,  # Keep the current attack out of that estimate.
        "attack_back_frames": 2,  # Positive spectral change isolates the new attack.
        "attack_ahead_frames": 2,  # Include adjacent FFT evidence for that attack.
        "band_edges_hz": (0, 180, 500, 1800, 4000),  # Coarse pulse-timbre bands.
        "noise_entropy": .6,  # Entropy tolerates zero bins after subtraction.
        "kick_low_share": .65,  # Bass concentration is an initial kick hypothesis.
        "hat_centroid_hz": 4800,  # Bright attacks support the hat hypothesis.
        "hat_tail_ratio": .005,  # Short broadband attacks also support hats.
        "early_frames": 3,  # Initial pulse-energy window.
        "tail_start_frames": 5,  # Exclude the attack from tail comparison.
        "tail_end_frames": 9,  # Short pulse-decay comparison window.
        "next_attack_guard_frames": 3,  # Do not attribute the next hit to this tail.
        "kick_cosine": .9,  # Repeatability of a pitched pulse template.
        "band_cosine": .95,  # Noise realizations use coarse timbral repeatability.
        "tail_ratio_limit": 4,  # Separate a long effect from a short percussion class.
        "tail_floor": .001,  # Keep comparisons finite for absent tails.
        "peak_prominence": .05,  # Rhythm proposal threshold; SFX thresholds remain separate.
        "peak_distance_sec": .08,  # Resolve fast subdivisions for rhythm proposals.
        "min_pulses": 4,  # Repetition requires more than an isolated sound.
        "min_span_sec": 2,  # Require temporal coverage before learning accompaniment.
        "min_period_frames": 2,  # Avoid degenerate numerical grids.
        "max_phases": 24,  # Bound the phase search cost.
        "grid_tolerance_sec": .06,  # Existing beat-nearness scale.
        "pulse_level_contrast": 1.8,  # Preserve the inherited pulse-versus-effect contrast gate.
        "min_duration_sec": 4,  # Short clips cannot establish a reliable lag family.
        "min_bpm": 40,  # Supported detector range, not an accuracy target.
        "max_bpm": 240,  # Supported detector range, not an accuracy target.
        "max_ac_peaks": 12,  # Bound candidate lag proposals.
        "fallback_prominence": .08,  # Generic pulses may propose, never certify, tempo.
        "lag_factors": (1 / 3, .5, 1, 2, 3),  # Only metrical relatives are compared.
        "period_dedupe_frames": .2,  # Collapse near-identical numerical estimates.
        "hat_multiplier": .5,  # Eighth-note hat hypothesis in a conventional kit.
        "snare_multiplier": 2,  # Backbeat hypothesis in a conventional kit.
        "sync_subdivision": 4,  # Quarter-beat lattice supports syncopated kicks.
        "sync_weight": .65,  # Partial support, not a claim every slot has a kick.
        "role_weights": {"kick": .45, "snare": .35, "hat": .2},  # Explicit accent-hierarchy hypothesis.
        "relative_tolerance": .06,  # Tolerance for a measured metrical-relative period.
        "alternative_min_score_ratio": .5,  # A published relative needs at least half the best fit's support.
        "confidence_base": .2,  # Ambiguous families retain only low confidence.
        "confidence_margin_cap": .8,  # Limit the margin contribution.
        "confidence_margin_gain": 2.4,  # Scale separation from metrical competitors.
        "suppression_factors": (.25, .5, 1, 2, 3),  # Accompaniment can occupy subdivisions.
        "pattern_cycles": (2, 3, 4),  # Test repeated patterns, including triple relations.
        "minimum_cycles": 2,  # Require at least two cycles of temporal evidence.
        "support_min": .75,  # Most pulses must support a grid or repeating pattern.
    },
}

BEAT_CONFIDENCE_MIN = AUDIO_TUNING["rhythm"]["min_beat_confidence"]
NO_INSTRUMENT_CONFIDENCE_CAP = BEAT_CONFIDENCE_MIN - AUDIO_TUNING["rhythm"]["unsupported_cap_gap"]
TEMPO_REASONS = frozenset(('too-short', 'no-pulses', 'low-confidence', 'no-audio'))


def false_alarm_grade(budget_per_sec, frame_rate, bands, degrees_freedom):
    """One-sided Student-t union bound, expressed in Q70-Q30 grade units."""
    from scipy.stats import t
    trials = frame_rate * bands
    if not 0 < budget_per_sec < trials or degrees_freedom <= 4:
        raise ValueError('invalid transient noise model or false-alarm budget')
    low, high = t.ppf([AUDIO_TUNING['sfx']['floor_percentile']/100, AUDIO_TUNING['sfx']['spread_percentile']/100], degrees_freedom)
    return float((t.isf(budget_per_sec/trials,degrees_freedom)-low)/(high-low))


_sfx = AUDIO_TUNING['sfx']
_trials_rate = _sfx['prepared_sample_rate'] / _sfx['hop']
_sfx['candidate_grade_min'] = false_alarm_grade(_sfx['candidate_false_peaks_per_sec'],_trials_rate,len(_sfx['bands_hz'])-1,_sfx['noise_degrees_freedom'])
_sfx['attack_energy_rise'] = 10 ** (_sfx['attack_rise_db']/20)
_sfx['epsilon'] = .5 / 2 ** (_sfx['pcm_bits']-1)
