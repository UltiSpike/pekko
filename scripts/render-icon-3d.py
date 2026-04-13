"""
Pekko 3D App Icon Renderer
Uses Blender's Python API to render a gold bird on a dark rounded-square background.
Run with: blender --background --python render-icon-3d.py
"""

import bpy
import bmesh
import math
import os
import sys

# ── Config ──
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
ICONSET_DIR = os.path.join(PROJECT_ROOT, 'assets', 'icons', 'pekko.iconset')
RENDER_SIZE = 1024  # render at 1024, downscale later

os.makedirs(ICONSET_DIR, exist_ok=True)

# ── Clean scene ──
bpy.ops.wm.read_factory_settings(use_empty=True)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 128
scene.render.resolution_x = RENDER_SIZE
scene.render.resolution_y = RENDER_SIZE
scene.render.film_transparent = True  # transparent BG, we composite later
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

# ── World: dark warm environment ──
world = bpy.data.worlds.new('PekkoWorld')
scene.world = world
world.use_nodes = True
wnodes = world.node_tree.nodes
wlinks = world.node_tree.links
wnodes.clear()

bg_node = wnodes.new('ShaderNodeBackground')
bg_node.inputs['Color'].default_value = (0.08, 0.05, 0.03, 1.0)
bg_node.inputs['Strength'].default_value = 0.3
output_node = wnodes.new('ShaderNodeOutputWorld')
wlinks.new(bg_node.outputs['Background'], output_node.inputs['Surface'])

# ── Camera ──
cam_data = bpy.data.cameras.new('Camera')
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 3.0
cam_obj = bpy.data.objects.new('Camera', cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj
cam_obj.location = (0, -5, 0.05)
cam_obj.rotation_euler = (math.radians(90), 0, 0)

# ── Lights ──
# Key light: warm, top-right
key_data = bpy.data.lights.new('KeyLight', 'AREA')
key_data.energy = 80
key_data.size = 3
key_data.color = (1.0, 0.92, 0.8)
key_obj = bpy.data.objects.new('KeyLight', key_data)
scene.collection.objects.link(key_obj)
key_obj.location = (1.5, -3, 2.5)
key_obj.rotation_euler = (math.radians(55), math.radians(15), math.radians(-20))

# Fill light: cooler, left
fill_data = bpy.data.lights.new('FillLight', 'AREA')
fill_data.energy = 25
fill_data.size = 4
fill_data.color = (0.85, 0.88, 1.0)
fill_obj = bpy.data.objects.new('FillLight', fill_data)
scene.collection.objects.link(fill_obj)
fill_obj.location = (-2, -3, 1)
fill_obj.rotation_euler = (math.radians(65), math.radians(-20), math.radians(15))

# Rim light: subtle, behind
rim_data = bpy.data.lights.new('RimLight', 'AREA')
rim_data.energy = 40
rim_data.size = 2
rim_data.color = (1.0, 0.85, 0.6)
rim_obj = bpy.data.objects.new('RimLight', rim_data)
scene.collection.objects.link(rim_obj)
rim_obj.location = (0.5, 2, 2)
rim_obj.rotation_euler = (math.radians(-60), 0, 0)


# ── Materials ──
def make_gold_material():
    """Warm gold with subtle metallic roughness"""
    mat = bpy.data.materials.new('Gold')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.92, 0.68, 0.22, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.7
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Specular IOR Level'].default_value = 0.6

    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat


def make_dark_bg_material():
    """Dark warm background with subtle sheen"""
    mat = bpy.data.materials.new('DarkBG')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.12, 0.08, 0.06, 1.0)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Specular IOR Level'].default_value = 0.3

    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat


def make_eye_material():
    """Dark eye"""
    mat = bpy.data.materials.new('Eye')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.02, 0.01, 0.01, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.2
    bsdf.inputs['Specular IOR Level'].default_value = 0.8

    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat


# ── Background plate: rounded square ──
bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0.1, 0))
bg_plate = bpy.context.active_object
bg_plate.name = 'BGPlate'

# Subdivide and round corners
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=6)
bpy.ops.object.mode_set(mode='OBJECT')

# Use a rounded cube instead for better corners
bpy.ops.object.delete()

bpy.ops.mesh.primitive_cube_add(size=2.8, location=(0, 0.18, 0))
bg_plate = bpy.context.active_object
bg_plate.name = 'BGPlate'
bg_plate.scale = (1, 0.05, 1)
bpy.ops.object.transform_apply(scale=True)

# Add bevel for macOS squircle-like rounded corners
bevel = bg_plate.modifiers.new('Bevel', 'BEVEL')
bevel.width = 0.62
bevel.segments = 24
bevel.limit_method = 'ANGLE'

# Smooth
subsurf = bg_plate.modifiers.new('Subsurf', 'SUBSURF')
subsurf.levels = 2
subsurf.render_levels = 3

bg_plate.data.materials.append(make_dark_bg_material())

# ── Bird body: sphere-based, centered at origin ──
# Body — the dominant mass, slightly egg-shaped
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.52, location=(0, -0.06, -0.08), segments=32, ring_count=16)
body = bpy.context.active_object
body.name = 'Body'
body.scale = (0.82, 0.65, 1.0)
bpy.ops.object.transform_apply(scale=True)

# Head — overlapping top-right of body
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.34, location=(0.2, -0.08, 0.38), segments=32, ring_count=16)
head = bpy.context.active_object
head.name = 'Head'

# Tail — flat wedge shape, angled back-down
bpy.ops.mesh.primitive_cube_add(size=0.4, location=(-0.42, -0.04, -0.42))
tail = bpy.context.active_object
tail.name = 'Tail'
tail.scale = (0.8, 0.25, 0.35)
tail.rotation_euler = (0, math.radians(30), 0)
bpy.ops.object.transform_apply(scale=True, rotation=True)
# Round the tail
tail_bevel = tail.modifiers.new('Bevel', 'BEVEL')
tail_bevel.width = 0.06
tail_bevel.segments = 4
tail_sub = tail.modifiers.new('Subsurf', 'SUBSURF')
tail_sub.levels = 2
tail_sub.render_levels = 2

# Beak — small cone pointing right
bpy.ops.mesh.primitive_cone_add(radius1=0.08, radius2=0.01, depth=0.22, location=(0.52, -0.1, 0.4))
beak = bpy.context.active_object
beak.name = 'Beak'
beak.rotation_euler = (math.radians(90), 0, math.radians(-90))
beak.scale = (0.6, 0.5, 1.0)
bpy.ops.object.transform_apply(scale=True, rotation=True)

# Wing — flattened ellipsoid, slightly darker via position
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.36, location=(-0.05, -0.2, -0.05), segments=24, ring_count=12)
wing = bpy.context.active_object
wing.name = 'Wing'
wing.scale = (0.85, 0.25, 0.6)
wing.rotation_euler = (0, math.radians(20), math.radians(-8))
bpy.ops.object.transform_apply(scale=True, rotation=True)

# Eye — small dark sphere
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, location=(0.38, -0.28, 0.48), segments=16, ring_count=8)
eye = bpy.context.active_object
eye.name = 'Eye'

# ── Apply materials ──
gold_mat = make_gold_material()
eye_mat = make_eye_material()

for obj in [head, body, tail, beak, wing]:
    obj.data.materials.append(gold_mat)
    # Smooth shading
    for face in obj.data.polygons:
        face.use_smooth = True

eye.data.materials.append(eye_mat)
for face in eye.data.polygons:
    face.use_smooth = True

# ── Join bird parts (except eye) for cleaner look ──
bpy.ops.object.select_all(action='DESELECT')
for obj in [head, body, tail, beak, wing]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
bird = bpy.context.active_object
bird.name = 'Bird'

# Smooth the joined bird
smooth = bird.modifiers.new('Smooth', 'SMOOTH')
smooth.factor = 0.5
smooth.iterations = 2

subsurf = bird.modifiers.new('Subsurf', 'SUBSURF')
subsurf.levels = 1
subsurf.render_levels = 2

# ── Render ──
output_path = os.path.join(ICONSET_DIR, 'icon_render_1024.png')
scene.render.filepath = output_path
bpy.ops.render.render(write_still=True)

print(f'\n  ✓ Rendered to {output_path}')
print('  Post-process with generate-icon-from-render.mjs to create all sizes.')
