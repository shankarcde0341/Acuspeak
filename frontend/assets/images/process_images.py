import os
import shutil
from PIL import Image, ImageFilter

images_dir = r"c:\PRACTICE\Acuspeak\Acuspeak_app\frontend\assets\images"

# 1. Back up original files if backups don't exist yet
files_to_backup = ["icon.png", "adaptive-icon.png", "favicon.png", "splash-image.png", "app-image.png", "app-tag.png"]
for f in files_to_backup:
    src = os.path.join(images_dir, f)
    name, ext = os.path.splitext(f)
    backup_path = os.path.join(images_dir, f"{name}_original_backup{ext}")
    if os.path.exists(src) and not os.path.exists(backup_path):
        shutil.copy2(src, backup_path)
        print(f"Backed up {f} -> {name}_original_backup{ext}")

# Load original high-res sources
icon_src = Image.open(os.path.join(images_dir, "icon_original_backup.png")).convert("RGBA")
tag_src = Image.open(os.path.join(images_dir, "app-tag_original_backup.png")).convert("RGBA")

# --- A. Process icon.png (1024x1024 Square App Icon) ---
w, h = icon_src.size
left = (w - h) // 2
crop_icon = icon_src.crop((left, 0, left + h, h))
icon_1024 = crop_icon.resize((1024, 1024), Image.Resampling.LANCZOS)

icon_1024.save(os.path.join(images_dir, "icon.png"), "PNG")
icon_1024.save(os.path.join(images_dir, "icon_1024x1024.png"), "PNG")
print("Saved icon.png & icon_1024x1024.png (1024x1024)")

# --- B. Process adaptive-icon.png (1024x1024 Android Adaptive Icon) ---
# Android adaptive icon requires inner safe-zone padding (~70% diameter)
ad_w = int(h * 1.22)
ad_left = max(0, (w - ad_w) // 2)
ad_crop = icon_src.crop((ad_left, 0, ad_left + ad_w, h))

bg_color = (11, 24, 54, 255) # Dark blue matching neon artwork
adaptive_bg = Image.new("RGBA", (1024, 1024), bg_color)
scale_ad = 800 / ad_w
ad_scaled_w = 800
ad_scaled_h = int(h * scale_ad)
scaled_ad = ad_crop.resize((ad_scaled_w, ad_scaled_h), Image.Resampling.LANCZOS)
adaptive_bg.paste(scaled_ad, ((1024 - ad_scaled_w) // 2, (1024 - ad_scaled_h) // 2))

adaptive_bg.save(os.path.join(images_dir, "adaptive-icon.png"), "PNG")
adaptive_bg.save(os.path.join(images_dir, "adaptive-icon_1024x1024.png"), "PNG")
print("Saved adaptive-icon.png & adaptive-icon_1024x1024.png (1024x1024)")

# --- C. Process favicon.png (512x512 Web Favicon) ---
fav_512 = crop_icon.resize((512, 512), Image.Resampling.LANCZOS)
fav_512.save(os.path.join(images_dir, "favicon.png"), "PNG")
fav_512.save(os.path.join(images_dir, "favicon_512x512.png"), "PNG")
print("Saved favicon.png & favicon_512x512.png (512x512)")

# --- D. Process splash-image.png & app-image.png (Splash screen using app-tag.png) ---
# Create clean high-resolution splash image containing app-tag.png artwork
# For Expo splash screen, saving app-tag.png centered on dark blue backdrop or high-res splash canvas
tw, th = tag_src.size
# Create 1407x408 clean tag copy
tag_src.save(os.path.join(images_dir, "app-tag.png"), "PNG")
tag_src.save(os.path.join(images_dir, "app-tag_highres.png"), "PNG")

# Splash screen image: 1242x2688 high res canvas
splash_bg = Image.new("RGBA", (1242, 2688), (11, 24, 52, 255))
# Soft edge feathering for tag_src
pad = 20
mask = Image.new("L", (tw, th), 0)
mask.paste(Image.new("L", (tw - 2*pad, th - 2*pad), 255), (pad, pad))
mask = mask.filter(ImageFilter.GaussianBlur(radius=pad/2))

tr, tg, tb, ta = tag_src.split()
out_ta = Image.eval(Image.merge("RGBA", (ta, ta, ta, mask)).convert("L"), lambda p: p)
tag_f = Image.merge("RGBA", (tr, tg, tb, out_ta))

scale_sp = 1160 / tw
sp_w = 1160
sp_h = int(th * scale_sp)
scaled_sp = tag_f.resize((sp_w, sp_h), Image.Resampling.LANCZOS)
splash_bg.paste(scaled_sp, ((1242 - sp_w) // 2, (2688 - sp_h) // 2), scaled_sp)

splash_bg.save(os.path.join(images_dir, "splash-image.png"), "PNG")
splash_bg.save(os.path.join(images_dir, "splash-image_updated.png"), "PNG")
splash_bg.save(os.path.join(images_dir, "splash-image_app-tag.png"), "PNG")

splash_bg.save(os.path.join(images_dir, "app-image.png"), "PNG")
splash_bg.save(os.path.join(images_dir, "app-image_updated.png"), "PNG")
print("Saved splash-image.png, app-image.png and new copies")

print("All PNG transformations completed successfully!")
