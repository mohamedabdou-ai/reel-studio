"""Named visual hypotheses; none are calibrated on project identities."""
VISUAL_TUNING = {
    'local_cuts': {
        'analysis_width': 64,  # Compact Lab thumbnails retain chroma swaps without storing full colour frames.
        'tile_widths': (4,8,16),  # Coarse-to-fine spatial proposals catch different region sizes.
        'pixel_delta': 25,  # Preserve the existing approximately ten-percent pixel-change scale.
        'cell_change_min': .1,  # At least a tenth of a proposal tile must change.
        'novelty_ratio': 2.5,  # A swap must stand out from surrounding motion, as in the global scout.
        'context_sec': .3,  # Observe holding content on both sides of a proposed boundary.
        'hold_sec': .12,  # Several frames must support each side, not a one-frame flash.
        'abrupt_share': .7,  # Most endpoint change must occur at the actual boundary, not across a pan.
        'hold_error_share': .25,  # Within-side drift must be small relative to replacement content.
        'min_area': .0025,  # A region below one four-hundredth of the canvas is unresolved here.
        'group_kernel': 3,  # Connect adjacent changed strokes without spanning distant regions.
        'dense_interior_share': .12,  # A small picture has changed interior, not only thin text strokes.
        'linework_height': .2,  # Tall coherent linework can be a character despite a sparse interior.
        'linework_aspect': 1.5,  # Wide shallow stroke clusters are more consistent with a text line.
        'edge_low': 50,  # Canny hysteresis lower contrast boundary for persistent geometry.
        'edge_high': 150,  # Canny hysteresis upper contrast boundary for persistent geometry.
        'same_edges_share': .9,  # Highlight/colour-only changes preserving text geometry are negatives.
        'edge_border_px': 3,  # A picture's outer frame is not internal text geometry.
        'texture_entropy_min': 3.,  # Eight effective luminance levels separate picture texture from flat glyph boxes.
        'text_line_aspect': 3.,  # A shallow flat strip is more likely a title/highlight than a picture panel.
        'protected_gradual_kinds': ('fade','flash','dissolve','slide','whip'),  # A recognized transition is not a sequence of local hard edges.
        'gradual_endpoint_score': .35,  # Preserve the existing endpoint criterion before protecting a gradual interval.
    },
}
