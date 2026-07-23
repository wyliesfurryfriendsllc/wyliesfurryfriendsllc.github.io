// Shared circular crop modal using Cropper.js
(function () {
    let cropperInst = null;
    let pendingResolve = null;

    function ensureModal() {
        if (document.getElementById('petCropModal')) return;
        const el = document.createElement('div');
        el.id = 'petCropModal';
        el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
        el.innerHTML = `
          <div style="background:#fff;border-radius:18px;padding:24px;max-width:480px;width:100%;max-height:90vh;display:flex;flex-direction:column;gap:14px;overflow:auto;box-sizing:border-box">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="margin:0;font-size:17px;font-weight:700;color:#3a2a1a;font-family:Inter,sans-serif">Crop Photo</h3>
              <button id="petCropX" style="background:none;border:none;font-size:24px;cursor:pointer;color:#aaa;line-height:1;padding:0 6px">×</button>
            </div>
            <div style="position:relative;overflow:hidden;background:#111;border-radius:12px;min-height:260px">
              <img id="petCropImg" style="display:block;max-width:100%">
            </div>
            <p style="margin:0;font-size:12px;color:#999;text-align:center;font-family:Inter,sans-serif">Move &amp; zoom to position · The circle shows the crop area</p>
            <div style="display:flex;gap:10px">
              <button id="petCropCancel" style="flex:1;padding:11px;border:1.5px solid #e0d0c0;border-radius:10px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;color:#8a6a5a">Cancel</button>
              <button id="petCropSave" style="flex:2;padding:11px;border:none;border-radius:10px;background:#e8735a;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif">Use This Photo</button>
            </div>
          </div>`;
        document.body.appendChild(el);
        document.getElementById('petCropX').onclick = cancelCrop;
        document.getElementById('petCropCancel').onclick = cancelCrop;
        document.getElementById('petCropSave').onclick = confirmCrop;
    }

    function cancelCrop() {
        closeCropModal();
        if (pendingResolve) { pendingResolve(null); pendingResolve = null; }
    }

    function confirmCrop() {
        if (!cropperInst) return;
        const sq = cropperInst.getCroppedCanvas({ width: 300, height: 300, imageSmoothingQuality: 'high' });
        const out = document.createElement('canvas');
        out.width = 300; out.height = 300;
        const ctx = out.getContext('2d');
        ctx.beginPath();
        ctx.arc(150, 150, 150, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(sq, 0, 0, 300, 300);
        const dataUrl = out.toDataURL('image/jpeg', 0.82);
        closeCropModal();
        if (pendingResolve) { pendingResolve(dataUrl); pendingResolve = null; }
    }

    function closeCropModal() {
        const modal = document.getElementById('petCropModal');
        if (modal) modal.style.display = 'none';
        if (cropperInst) { cropperInst.destroy(); cropperInst = null; }
    }

    window.openCropModal = function (file) {
        return new Promise(resolve => {
            pendingResolve = resolve;
            ensureModal();
            if (cropperInst) { cropperInst.destroy(); cropperInst = null; }
            const img = document.getElementById('petCropImg');
            const modal = document.getElementById('petCropModal');
            const reader = new FileReader();
            reader.onload = e => {
                img.src = e.target.result;
                img.onload = () => {
                    modal.style.display = 'flex';
                    cropperInst = new Cropper(img, {
                        aspectRatio: 1,
                        viewMode: 1,
                        dragMode: 'move',
                        autoCropArea: 0.85,
                        restore: false,
                        guides: false,
                        center: false,
                        highlight: false,
                        cropBoxMovable: false,
                        cropBoxResizable: false,
                        toggleDragModeOnDblclick: false,
                    });
                };
            };
            reader.readAsDataURL(file);
        });
    };
})();
