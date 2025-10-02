

// FIX: Moved declare statements to the top level. `declare` cannot be used inside a function block.
declare var Chart: any;
declare var Cropper: any;
declare var XLSX: any;

document.addEventListener('DOMContentLoaded', () => {
    // FIX: Add interfaces for state objects to provide strong typing.
    interface Animal {
        id: number;
        createdAt: number;
        name: string;
        species: 'chicken' | 'duck';
        sponsorId: number | null;
        ringColor: string;
        ringCount: number;
        hasCustomImage: boolean;
        imageUrl?: string;
    }
    
    interface Sponsor {
        id: number;
        createdAt: number;
        name: string;
        level: "Silber" | "Gold" | "King Edition";
        hasCustomImage: boolean;
        imageUrl?: string;
    }
    
    interface EggLog {
        date: string;
        chicken: number;
        duck: number;
    }
    
    interface AppState {
        animals: Animal[];
        sponsors: Sponsor[];
        eggLogs: EggLog[];
    }
    
    let db: IDBDatabase;
    // FIX: Type activeEditSession to allow newImageBlob property.
    let activeEditSession: { newImageBlob?: Blob } = {};
    // FIX: Type activeModalObjectUrls to be a Set of strings.
    let activeModalObjectUrls = new Set<string>();
    let unsponsoredChartInstance: any = null;
    
    // FIX: Apply the AppState interface to the state object.
    let state: AppState = {
        animals: [],
        sponsors: [],
        eggLogs: []
    };
    
    const sponsorshipColors = {
        "Silber": "#C0C0C0",
        "Gold": "#FFD700",
        "King Edition": "#8A2BE2",
    };
    
    const funnyAnimalNames = ["Hungrige Helga", "Flotter Otto", "Gacker-Gerd", "Renn-Renate", "Körner-Klaus", "Berta Brütfix", "Eier-Erna", "Feder-Fritz"];
    const funnySponsorNames = ["Eier-Baron von Schnatterfeld", "Körner-Königin Klara", "Der Hühner-Flüsterer", "Geflügel-Gönner e.V.", "Die Feder-Freunde", "Stall-Stifter Siegfried"];

    // --- DATABASE FUNCTIONS ---
    // FIX: Add Promise<void> return type.
    function initDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open('chickenAppDB', 2);
                request.onupgradeneeded = (event) => {
                    // FIX: Property 'result' does not exist on type 'EventTarget'. Cast target to IDBOpenDBRequest.
                    const dbInstance = (event.target as IDBOpenDBRequest).result;
                    if (!dbInstance.objectStoreNames.contains('images')) {
                        dbInstance.createObjectStore('images', { keyPath: 'id' });
                    }
                    if (!dbInstance.objectStoreNames.contains('appState')) {
                        dbInstance.createObjectStore('appState');
                    }
                    if (!dbInstance.objectStoreNames.contains('appSettings')) {
                        dbInstance.createObjectStore('appSettings');
                    }
                };
                // FIX: Property 'result' does not exist on type 'EventTarget'. Cast target to IDBOpenDBRequest.
                request.onsuccess = (event) => { db = (event.target as IDBOpenDBRequest).result; resolve(); };
                // FIX: Property 'error' does not exist on type 'EventTarget'. Cast target to IDBOpenDBRequest.
                request.onerror = (event) => { console.error("IndexedDB error:", (event.target as IDBOpenDBRequest).error); reject("Error opening IndexedDB"); };
            } catch (e) { console.error("IndexedDB could not be opened.", e); reject("IndexedDB is not available"); }
        });
    }

    // FIX: Add Promise<void> return type and type function arguments.
    function saveDataToDB(storeName: string, key: string, value: any): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!db) { return reject("DB not initialized"); }
            try {
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(value, key);
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject((event.target as IDBRequest).error);
            } catch (e) { reject(e); }
        });
    }

    // FIX: Type function arguments and cast event target on error.
    function loadDataFromDB(storeName: string, key: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!db) { return reject("DB not initialized"); }
            try {
                const transaction = db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject((event.target as IDBRequest).error);
            } catch (e) { reject(e); }
        });
    }

    // FIX: Add Promise<void> return type, type arguments, and cast event target on error.
    function saveImage(id: number, blob: Blob): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['images'], 'readwrite');
            transaction.oncomplete = () => { console.log(`[saveImage] Transaction complete for ID: ${id}`); resolve(); };
            transaction.onerror = (event) => { console.error(`[saveImage] Transaction error for ID: ${id}`, (event.target as IDBTransaction).error); reject((event.target as IDBTransaction).error); };
            const store = transaction.objectStore('images');
            store.put({ id: id, blob: blob });
        });
    }

    // FIX: Type arguments and return value, and cast event targets.
    function getImage(id: number): Promise<Blob | null> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.get(id);
            request.onsuccess = (event) => resolve((event.target as IDBRequest).result ? (event.target as IDBRequest).result.blob : null);
            request.onerror = (event) => reject((event.target as IDBRequest).error);
        });
    }
    
    // FIX: Add Promise<void> return type, type arguments, and cast event target on error.
    function deleteImage(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['images'], 'readwrite');
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject((event.target as IDBTransaction).error);
            const store = transaction.objectStore('images');
            store.delete(id);
        });
    }

    // --- STATE MANAGEMENT ---
    async function saveState() {
        try {
            await saveDataToDB('appState', 'mainState', state);
            showToast('Daten erfolgreich gespeichert!');
        } catch (error) {
            console.error("Failed to save state to DB:", error);
            showAlert("Speichern fehlgeschlagen! Die Daten konnten nicht in der Datenbank gesichert werden.");
        }
    }

    async function loadState() {
        try {
            const data = await loadDataFromDB('appState', 'mainState');
            if (data) {
                state = data;
            }
        } catch (error) {
            console.error("Failed to load state from DB:", error);
            showAlert("Laden der Daten fehlgeschlagen. Die App startet möglicherweise mit leeren Daten.");
        }
    }

    // --- UI & LAYOUT ---
    async function loadDashboardOrder() {
        const grid = document.getElementById('dashboard-grid');
        const allCardIdsInHtml = [...grid.querySelectorAll('.card')].map(c => c.id);
        const storedOrder = await loadDataFromDB('appSettings', 'dashboardOrder').catch(() => null);

        // FIX: Property 'length' does not exist on type 'unknown'. Check if it's an array.
        if (Array.isArray(storedOrder) && storedOrder.length > 0) {
            const fragment = document.createDocumentFragment();
            const orderedIds = new Set();
            const cardNodes = new Map<string, Element>();
            grid.querySelectorAll('.card').forEach(card => cardNodes.set(card.id, card));
            
            // FIX: Property 'forEach' does not exist on type 'unknown'.
            storedOrder.forEach(cardId => {
                if (cardNodes.has(cardId)) {
                    fragment.appendChild(cardNodes.get(cardId)!);
                    orderedIds.add(cardId);
                }
            });
            allCardIdsInHtml.forEach(cardId => {
                if (!orderedIds.has(cardId) && cardNodes.has(cardId)) {
                    fragment.appendChild(cardNodes.get(cardId)!);
                }
            });
            grid.appendChild(fragment);
        }
    }

    // --- MODAL & URL MANAGEMENT ---
    let isModalOpen = false;
    function createManagedObjectURL(blob: Blob) {
        const url = URL.createObjectURL(blob);
        activeModalObjectUrls.add(url);
        return url;
    }

    // FIX: Type the options parameter to handle 'stack' property.
    function openModal(modalContent: string, onOpen: ((modalWrapper: HTMLElement) => void) | null = null, options: { stack?: boolean } = {}) {
        // FIX: Property 'stack' does not exist on type '{}'.
        const { stack = false } = options;
        if (isModalOpen && !stack) {
            closeModalDOM(true);
        }
        history.pushState({ modal: true, stacked: stack }, null);
        isModalOpen = true;

        const modalContainer = document.getElementById('modal-container');
        const modalWrapper = document.createElement('div');
        const existingModals = document.querySelectorAll('.modal-wrapper');
        // FIX: Type 'number' is not assignable to type 'string'. Convert zIndex to string.
        modalWrapper.style.zIndex = (50 + (existingModals.length * 10)).toString();
        modalWrapper.className = 'modal-wrapper fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 opacity-0 transition-opacity duration-300';
        modalWrapper.innerHTML = `<div class="modal-content w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 relative"><button class="close-modal-btn absolute top-4 right-4 text-gray-500 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 text-3xl z-10">&times;</button>${modalContent}</div>`;
        modalContainer.appendChild(modalWrapper);

        setTimeout(() => {
            modalWrapper.classList.remove('opacity-0');
            // FIX: Property 'style' does not exist on type 'Element'. Cast to HTMLElement.
            const contentEl = modalWrapper.querySelector('.modal-content') as HTMLElement;
            if (contentEl) contentEl.style.transform = 'scale(1)';
        }, 10);

        modalWrapper.querySelector('.close-modal-btn').addEventListener('click', () => history.back());
        modalWrapper.addEventListener('click', (e) => { if(e.target === e.currentTarget) history.back(); });
        if (onOpen) onOpen(modalWrapper);
    }

    function closeModalDOM(instant = false) {
        const allModals = document.querySelectorAll('.modal-wrapper');
         if (allModals.length === 0) {
            isModalOpen = false;
            return;
        }
        const modalWrapper = allModals[allModals.length - 1];

        // FIX: Argument of type 'unknown' is not assignable to parameter of type 'string'.
        activeModalObjectUrls.forEach(url => URL.revokeObjectURL(url));
        activeModalObjectUrls.clear();

        if (modalWrapper) {
            if (instant) {
                modalWrapper.remove();
            } else {
                modalWrapper.classList.add('opacity-0');
                // FIX: Property 'style' does not exist on type 'Element'. Cast to HTMLElement.
                const contentEl = modalWrapper.querySelector('.modal-content') as HTMLElement;
                if (contentEl) contentEl.style.transform = 'scale(0.95)';
                setTimeout(() => modalWrapper.remove(), 300);
            }
        }
        
        if(document.querySelectorAll('.modal-wrapper').length <= 1) {
            isModalOpen = false;
        }
    }

    window.addEventListener('popstate', () => { if (isModalOpen) closeModalDOM(); });
    
    // --- UTILITY FUNCTIONS ---
    async function generateImageHash(blob: Blob) { if (!blob) return null; const buffer = await blob.slice(0, 2048).arrayBuffer(); const uint8 = new Uint8Array(buffer); return Array.from(uint8).map(b => b.toString(16).padStart(2, '0')).join(''); }
    function getFormattedDate(date: Date) { return date.toISOString().split('T')[0]; }
    function showToast(message: string) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.remove('opacity-0'); setTimeout(() => { toast.classList.add('opacity-0'); }, 3000); }
    function blobToBase64(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); }); }
    async function base64ToBlob(base64: string): Promise<Blob> { const response = await fetch(base64); return await response.blob(); }
    
    // FIX: Add Promise<void> return type.
    async function showAlert(message: string): Promise<void> {
        return new Promise(resolve => {
            const alertWrapper = document.createElement('div');
            alertWrapper.className = 'modal-wrapper fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[100] p-4';
            const content = `
                <div class="modal-content w-full max-w-sm p-6 text-center">
                    <p class="text-lg mb-6">${message}</p>
                    <div class="flex justify-end gap-4">
                        <button id="alert-ok" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg">OK</button>
                    </div>
                </div>`;
            alertWrapper.innerHTML = content;
            document.body.appendChild(alertWrapper);
            alertWrapper.querySelector('#alert-ok').addEventListener('click', () => {
                alertWrapper.remove();
                resolve();
            });
        });
    }

    async function showConfirmation(message: string): Promise<boolean> {
        return new Promise(resolve => {
            const confirmWrapper = document.createElement('div');
            confirmWrapper.className = 'modal-wrapper fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-[100] p-4';
            const content = `
                <div class="modal-content w-full max-w-sm p-6 text-center">
                    <p class="text-lg mb-6">${message}</p>
                    <div class="flex justify-center gap-4">
                        <button id="confirm-cancel" class="bg-gray-500 text-white font-bold py-2 px-6 rounded-full hover:bg-gray-600">Nein</button>
                        <button id="confirm-ok" class="bg-green-500 text-white font-bold py-2 px-6 rounded-full hover:bg-green-600">Ja</button>
                    </div>
                </div>`;
            confirmWrapper.innerHTML = content;
            document.body.appendChild(confirmWrapper);
            confirmWrapper.querySelector('#confirm-ok').addEventListener('click', () => {
                confirmWrapper.remove();
                resolve(true);
            });
            confirmWrapper.querySelector('#confirm-cancel').addEventListener('click', () => {
                confirmWrapper.remove();
                resolve(false);
            });
        });
    }
    
    // --- UI COMPONENTS & RENDERING ---
    function renderDashboard() {
        // FIX: Type 'number' is not assignable to type 'string'. Convert counts to string.
        document.getElementById('chicken-count').textContent = state.animals.filter(a => a.species === 'chicken').length.toString();
        document.getElementById('duck-count').textContent = state.animals.filter(a => a.species === 'duck').length.toString();
        document.getElementById('sponsor-count').textContent = state.sponsors.length.toString();
        document.getElementById('sponsored-animals-count').textContent = new Set(state.animals.filter(a => a.sponsorId).map(a => a.sponsorId)).size.toString();
        const todayLog = state.eggLogs.find(log => log.date === getFormattedDate(new Date())) || { chicken: 0, duck: 0 };
        document.getElementById('egg-chicken-today').textContent = todayLog.chicken.toString();
        document.getElementById('egg-duck-today').textContent = todayLog.duck.toString();

        const sponsoredCount = state.animals.filter(a => a.sponsorId).length;
        const unsponsoredCount = state.animals.length - sponsoredCount;

        document.getElementById('unsponsored-count-text').textContent = unsponsoredCount.toString();

        const ctx = document.getElementById('unsponsored-chart');
        if (ctx) {
            if (unsponsoredChartInstance) {
                unsponsoredChartInstance.destroy();
            }
            // FIX: Cannot find name 'Chart'. (Fixed by declare var)
            unsponsoredChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Mit Pate', 'Ohne Pate'],
                    datasets: [{
                        data: [sponsoredCount, unsponsoredCount],
                        backgroundColor: ['#4ade80', '#f87171'],
                        borderColor: [ 'var(--bg-card)' ],
                        borderWidth: 4,
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: true, callbacks: { label: (c: any) => `${c.label}: ${c.raw}` } }
                    },
                    animation: { animateScale: true, animateRotate: true }
                }
            });
        }
    }

    function openCropperModal(imageSrc: string, onCrop: (blob: Blob) => void) {
        let cropper: any;
        const content = `<h2 class="text-2xl font-bold mb-4">Bild zuschneiden</h2><div class="pb-24"><img id="cropper-image" src="${imageSrc}" style="max-width: 100%;"></div><div class="sticky bottom-0 -mx-6 -mb-6 p-4 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-600"><div class="text-center"><button id="crop-btn" class="bg-green-500 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-green-600" disabled>Zuschnitt übernehmen</button></div></div>`;
        
        openModal(content, (modalWrapper) => {
            const image = modalWrapper.querySelector('#cropper-image') as HTMLImageElement;
            const cropBtn = modalWrapper.querySelector('#crop-btn') as HTMLButtonElement;
            
            const initCropper = () => {
                if (cropper) cropper.destroy();
                // FIX: Cannot find name 'Cropper'. (Fixed by declare var)
                cropper = new Cropper(image, {
                    aspectRatio: 1,
                    viewMode: 1,
                    background: false,
                    autoCropArea: 0.8,
                    dragMode: 'move',
                    ready: function () {
                        cropBtn.disabled = false;
                    }
                });
            };

            if (image.complete) {
                initCropper();
            } else {
                image.onload = initCropper;
            }

            cropBtn.addEventListener('click', () => {
                if (!cropper || !cropper.ready) return;
                
                const canvas = cropper.getCroppedCanvas({ width: 300, height: 300, imageSmoothingQuality: 'high' });
                if (canvas) {
                    canvas.toBlob((blob) => { if (blob) onCrop(blob); }, 'image/png');
                } else {
                    showAlert("Fehler: Bildausschnitt konnte nicht erstellt werden.");
                }
            });
        }, { stack: true });
    }
    
    function renderRingIndicator(animal: Animal) { if (!animal.ringColor||!animal.ringCount||animal.ringCount===0) { return '<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Kennzeichnung: Blank</p>'; } const c:{[key:string]:string}={'red':'#ef4444','blue':'#3b82f6','green':'#22c55e','yellow':'#eab308','black':'#1f2937','white':'#f9fafb'}; let h=''; for(let i=0;i<animal.ringCount;i++){h+=`<div class="w-3 h-3 rounded-full border border-gray-400" style="background-color: ${c[animal.ringColor]||'#9ca3af'};"></div>`;} return `<div class="flex items-center justify-center gap-1 mt-1">${h}</div>`; }
    
    async function createAnimalCardHTML(animal: Animal, sponsorsMap: Map<number, Sponsor>) {
        const fallbackImageUrl = `https://placehold.co/300x200/cccccc/4A2E2E?text=${encodeURIComponent(animal.name)}`;
        let imageUrl = animal.imageUrl || fallbackImageUrl;
        if (animal.hasCustomImage) {
            try {
                const blob = await getImage(animal.id);
                imageUrl = blob ? createManagedObjectURL(blob) : fallbackImageUrl;
            } catch (error) {
                console.error(`Failed to load image for animal ${animal.id}`, error);
                imageUrl = fallbackImageUrl;
            }
        }
        const sponsor = animal.sponsorId ? sponsorsMap.get(animal.sponsorId) : null;
        const borderColor = sponsor ? sponsorshipColors[sponsor.level] : '#BDC3C7';
        const sponsorName = sponsor ? sponsor.name : 'Kein Pate';

        return `
            <div class="card overflow-hidden animal-list-card" data-id="${animal.id}" style="border-color:${borderColor};">
                <img src="${imageUrl}" alt="${animal.name}" class="w-full h-40 object-cover rounded-t-lg pointer-events-none">
                <div class="p-4 pointer-events-none">
                    <h4 class="font-bold text-xl">${animal.name} (${animal.species==='chicken'?'Huhn':'Ente'})</h4>
                    ${renderRingIndicator(animal)}
                    <p class="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-center mt-1">
                        <span class="sponsor-color-dot" style="background-color:${borderColor};"></span>${sponsorName}
                    </p>
                </div>
            </div>`;
    }

    async function createSponsorListItemHTML(sponsor: Sponsor) {
        let imageHtml;
        const fallbackImageHtml = `<div class="w-12 h-12 rounded-full mr-4 flex items-center justify-center" style="background-color: ${sponsorshipColors[sponsor.level]}"><span class="text-white font-bold text-xl">${sponsor.name.charAt(0)}</span></div>`;
        
        if (sponsor.hasCustomImage) {
            try {
                const blob = await getImage(sponsor.id);
                const url = blob ? createManagedObjectURL(blob) : null;
                imageHtml = url ? `<img src="${url}" alt="${sponsor.name}" class="w-12 h-12 object-cover rounded-full mr-4">` : fallbackImageHtml;
            } catch (error) {
                console.error(`Failed to load image for sponsor ${sponsor.id}`, error);
                imageHtml = fallbackImageHtml;
            }
        } else {
            imageHtml = fallbackImageHtml;
        }
        
        const sponsoredAnimals = state.animals.filter(a => a.sponsorId === sponsor.id);
        let sponsoredAnimalsHtml = '';
        if (sponsoredAnimals.length > 0) {
            sponsoredAnimalsHtml = `
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <strong>Patentiere (${sponsoredAnimals.length}):</strong>
                    <span>${sponsoredAnimals.map(a => a.name).join(', ')}</span>
                </div>`;
        }

        return `
            <div class="card p-4 sponsor-list-card" data-id="${sponsor.id}" style="border-color: ${sponsorshipColors[sponsor.level]};">
                <div class="flex justify-between items-start pointer-events-none">
                    <div class="flex items-center">
                        ${imageHtml}
                        <div>
                            <h4 class="font-bold text-lg flex items-center"><span class="sponsor-color-dot" style="background-color: ${sponsorshipColors[sponsor.level]}"></span>${sponsor.name}</h4>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Modell: ${sponsor.level}</p>
                            ${sponsoredAnimalsHtml}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    function setupImageUploader(modal: HTMLElement, saveBtn: HTMLButtonElement) {
        const imageInput = modal.querySelector('#image-input') as HTMLInputElement;
        const imagePreviewContainer = modal.querySelector('#image-preview-container') as HTMLElement;
        const takePhotoButton = modal.querySelector('#take-photo') as HTMLButtonElement;
        const uploadPhotoButton = modal.querySelector('#upload-photo') as HTMLButtonElement;

        if (!imageInput || !imagePreviewContainer || !takePhotoButton || !uploadPhotoButton) return;

        takePhotoButton.addEventListener('click', () => { imageInput.setAttribute('capture', 'environment'); imageInput.click(); });
        uploadPhotoButton.addEventListener('click', () => { imageInput.removeAttribute('capture'); imageInput.click(); });

        imageInput.addEventListener('change', e => {
            const file = (e.target as HTMLInputElement).files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const imageUrl = event.target.result as string;
                    const crop = await showConfirmation("Möchtest du das Bild zuschneiden?");

                    const processBlob = async (blob: Blob) => {
                        imagePreviewContainer.innerHTML = `<img src="${createManagedObjectURL(blob)}" class="h-20 w-20 object-cover rounded-full">`;
                        // FIX: Property 'newImageBlob' does not exist on type '{}'.
                        activeEditSession.newImageBlob = blob;
                        saveBtn.disabled = false;
                    };
                    
                    if (crop) {
                        openCropperModal(imageUrl, (croppedBlob) => {
                            processBlob(croppedBlob);
                            history.back(); 
                        });
                    } else {
                        processBlob(file); 
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    function renderAddNewModal() {
        let content = `<h2 class="text-3xl font-bold mb-4">Was möchtest du anlegen?</h2><div class="flex flex-col sm:flex-row justify-center gap-4"><button id="add-new-animal-from-modal" class="bg-green-500 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-green-600">Neues Tier 🐔</button><button id="add-new-sponsor-from-modal" class="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-blue-600">Neuer Pate ❤️</button></div>`;
        openModal(content, (modal) => {
            modal.querySelector('#add-new-animal-from-modal').addEventListener('click', () => renderEditAnimalModal());
            modal.querySelector('#add-new-sponsor-from-modal').addEventListener('click', () => renderEditSponsorModal());
        });
    }
    
    function renderSettingsModal() {
        const grid = document.getElementById('dashboard-grid');
        const cardsHtml = grid.innerHTML;
        const isDarkMode = document.documentElement.classList.contains('dark');
        let content = `
            <h2 class="text-3xl font-bold mb-4">Einstellungen</h2>
            <div class="flex items-center justify-between p-4 border-b border-[var(--input-border)] mb-4">
                <label for="dark-mode-toggle" class="font-semibold">Dark Mode</label>
                <label class="switch">
                    <input type="checkbox" id="dark-mode-toggle" ${isDarkMode ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <h3 class="text-2xl font-bold mb-4">Layout anpassen</h3>
            <p class="mb-6 text-[var(--text-color-light)]">Halte eine Karte gedrückt, um sie zu verschieben. Lege sie an der gewünschten Position ab und klicke anschließend auf "Speichern".</p>
            <div id="settings-grid" class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 settings-mode pb-24">${cardsHtml}</div>
            <div class="sticky bottom-0 -mx-6 -mb-6 p-4 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-600">
                <div class="text-center">
                    <button id="save-layout-btn" class="bg-green-500 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-green-600">Layout speichern</button>
                </div>
            </div>`;
        openModal(content, (modal) => {
            const settingsGrid = modal.querySelector('#settings-grid') as HTMLElement;
            initModalDraggable(settingsGrid);
            modal.querySelector('#dark-mode-toggle').addEventListener('change', toggleTheme);
            modal.querySelector('#save-layout-btn').addEventListener('click', async () => {
                const orderedIds = [...settingsGrid.querySelectorAll('.card')].map(card => card.id);
                try {
                    await saveDataToDB('appSettings', 'dashboardOrder', orderedIds);
                    await loadDashboardOrder();
                    history.back();
                    showToast('Layout erfolgreich gespeichert!');
                } catch (error) {
                    console.error("Failed to save layout:", error);
                    showAlert("Layout konnte nicht gespeichert werden.");
                }
            });
        });
    }

    function renderEggModal(){const tC=state.eggLogs.reduce((s,l)=>s+l.chicken,0);const tD=state.eggLogs.reduce((s,l)=>s+l.duck,0);const sL=[...state.eggLogs].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());let c=`<h2 class="text-3xl font-bold mb-4">Eier Logbuch</h2><div class="grid grid-cols-1 md:grid-cols-2 gap-8"><div><h3 class="font-bold text-xl mb-2">Gesamtverteilung</h3><canvas id="egg-pie-chart"></canvas></div><div><h3 class="font-bold text-xl mb-2">Produktion über Zeit</h3><canvas id="egg-line-chart"></canvas></div></div><div class="mt-8"><h3 class="font-bold text-xl mb-2">Historie</h3><div class="max-h-60 overflow-y-auto border rounded-lg p-2"><table class="w-full text-left"><thead><tr class="border-b"><th>Datum</th><th>Hühnereier</th><th>Enteneier</th></tr></thead><tbody>${sL.map(l=>`<tr><td>${new Date(l.date).toLocaleDateString('de-DE')}</td><td>${l.chicken}</td><td>${l.duck}</td></tr>`).join('')}</tbody></table></div></div>`;openModal(c,m=>{new Chart(m.querySelector('#egg-pie-chart'),{type:'pie',data:{labels:['Hühnereier','Enteneier'],datasets:[{data:[tC,tD],backgroundColor:['#FFC107','#87CEEB']}]}});const ll=sL.slice(0,10).reverse().map(l=>new Date(l.date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}));const lc=sL.slice(0,10).reverse().map(l=>l.chicken);const ld=sL.slice(0,10).reverse().map(l=>l.duck);new Chart(m.querySelector('#egg-line-chart'),{type:'line',data:{labels:ll,datasets:[{label:'Hühnereier',data:lc,borderColor:'#FFC107',tension:0.1},{label:'Enteneier',data:ld,borderColor:'#87CEEB',tension:0.1}]}});});}
    
    function renderFileModal(){let c='<h2 class="text-3xl font-bold mb-4">Dateimanagement</h2><p class="mb-6">Lade deine Tier- und Patendaten als Excel-Datei herunter oder lade eine bestehende Datei hoch, um deine Daten zu aktualisieren.</p><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="p-4 border rounded-lg"><h3 class="font-bold text-lg mb-2">Daten Herunterladen</h3><button id="export-data" class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">Daten als Excel exportieren</button></div><div class="p-4 border rounded-lg"><h3 class="font-bold text-lg mb-2">Daten Hochladen</h3><label for="import-file" class="w-full text-center bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 cursor-pointer block">Excel-Datei importieren</label><input type="file" id="import-file" class="hidden" accept=".xlsx, .xls"><p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Hinweis: Beim Import werden bestehende Daten überschrieben. Bitte lade zuerst deine aktuellen Daten herunter, um die richtige Formatierung sicherzustellen.</p></div></div><div class="mt-8 p-4 border-2 border-red-400 rounded-lg bg-red-50 dark:bg-red-900/20"><h3 class="font-bold text-lg mb-2 text-red-700 dark:text-red-300">Gefahrenzone</h3><p class="mb-4 text-sm text-red-600 dark:text-red-300">Diese Aktion kann nicht rückgängig gemacht werden. Alle Tier-, Paten- und Eierdaten werden dauerhaft gelöscht.</p><button id="delete-all-data" class="w-full bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600">Alle App-Daten löschen</button></div>';openModal(c,m=>{m.querySelector('#export-data').addEventListener('click',exportData);m.querySelector('#import-file').addEventListener('change',importData);m.querySelector('#delete-all-data').addEventListener('click',deleteAllData);});}

    
    function initModalDraggable(container: HTMLElement) {
        let draggingCard: HTMLElement = null, longPressTimer: number = null, isDragging = false;
        const preventDefault = (e: Event) => e.preventDefault();
        container.querySelectorAll('.card').forEach(card => {
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', () => { isDragging = true; draggingCard = card as HTMLElement; document.addEventListener('dragover', preventDefault); setTimeout(() => card.classList.add('dragging'), 0); });
            card.addEventListener('dragend', () => { document.removeEventListener('dragover', preventDefault); if (draggingCard) draggingCard.classList.remove('dragging'); draggingCard = null; isDragging = false; });
            card.addEventListener('touchstart', () => { if (isDragging) return; draggingCard = card as HTMLElement; longPressTimer = window.setTimeout(() => { isDragging = true; draggingCard.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(50); }, 250); }, { passive: true });
            card.addEventListener('touchend', () => { clearTimeout(longPressTimer); if (isDragging && draggingCard) { draggingCard.classList.remove('dragging'); } draggingCard = null; isDragging = false; });
            card.addEventListener('touchmove', e => { if (longPressTimer && !isDragging) clearTimeout(longPressTimer); if (isDragging && draggingCard) { e.preventDefault(); const touch = (e as TouchEvent).touches[0]; const afterElement = getDragAfterElement(container, touch.clientY); container.insertBefore(draggingCard, afterElement); } }, { passive: false });
        });
        container.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); if (!draggingCard) return; const afterElement = getDragAfterElement(container, e.clientY); container.insertBefore(draggingCard, afterElement); });
        container.addEventListener('drop', (e: DragEvent) => e.preventDefault());
        function getDragAfterElement(container: HTMLElement, y: number) {
            const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
            return draggableElements.reduce((closest, child) => { const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2; if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } else { return closest; } }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
        }
    }

    // FIX: Type options parameter.
    interface RenderAnimalModalOptions { filter?: string; sponsorFilter?: string; sortBy?: string; }
    async function renderAnimalModal(options: RenderAnimalModalOptions = {}) {
        const { filter = '', sponsorFilter = 'all', sortBy = 'createdAt_desc' } = options;
        const sponsorsMap = new Map(state.sponsors.map(s => [s.id, s]));
        let filteredAnimals = state.animals;

        if (sponsorFilter === 'sponsored') {
            filteredAnimals = filteredAnimals.filter(a => a.sponsorId);
        } else if (sponsorFilter === 'unsponsored' || sponsorFilter === 'none') {
            filteredAnimals = filteredAnimals.filter(a => !a.sponsorId);
        }

        if (filter) {
            const s = filter.toLowerCase();
            filteredAnimals = filteredAnimals.filter(a => {
                const sp = a.sponsorId ? sponsorsMap.get(a.sponsorId) : null;
                return a.name.toLowerCase().includes(s) || a.species.toLowerCase().includes(s) || (sp && sp.name.toLowerCase().includes(s));
            });
        }

        filteredAnimals.sort((a, b) => {
            switch (sortBy) {
                case 'name_asc': return a.name.localeCompare(b.name);
                case 'createdAt_desc': return b.createdAt - a.createdAt;
                case 'createdAt_asc': return a.createdAt - b.createdAt;
                default: return 0;
            }
        });
        const animalCardsPromises = filteredAnimals.map(animal => createAnimalCardHTML(animal, sponsorsMap));
        const animalCardsHtml = (await Promise.all(animalCardsPromises)).join('');

        const content = `
            <h2 class="text-3xl font-bold mb-4">Tierübersicht</h2>
            <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <input type="text" id="animal-search" class="w-full p-2 border rounded-lg sm:col-span-2 lg:col-span-1" placeholder="Suche..." value="${filter}">
                <select id="animal-sponsor-filter" class="w-full p-2 border rounded-lg">
                    <option value="all" ${sponsorFilter === 'all' ? 'selected' : ''}>Alle Tiere</option>
                    <option value="sponsored" ${sponsorFilter === 'sponsored' ? 'selected' : ''}>Mit Paten</option>
                    <option value="unsponsored" ${sponsorFilter === 'unsponsored' || sponsorFilter === 'none' ? 'selected' : ''}>Ohne Paten</option>
                </select>
                <select id="animal-sort" class="w-full p-2 border rounded-lg">
                    <option value="createdAt_desc" ${sortBy === 'createdAt_desc' ? 'selected' : ''}>Neueste zuerst</option>
                    <option value="createdAt_asc" ${sortBy === 'createdAt_asc' ? 'selected' : ''}>Älteste zuerst</option>
                    <option value="name_asc" ${sortBy === 'name_asc' ? 'selected' : ''}>Name (A-Z)</option>
                </select>
                <button id="add-new-animal-btn" class="bg-green-500 text-white font-bold py-2 px-4 rounded-full hover:bg-green-600 whitespace-nowrap">Neues Tier +</button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">${animalCardsHtml || '<p>Keine Tiere gefunden.</p>'}</div>
        `;
        openModal(content, m => {
            const searchInput = m.querySelector('#animal-search') as HTMLInputElement;
            const sortSelect = m.querySelector('#animal-sort') as HTMLSelectElement;
            const sponsorFilterSelect = m.querySelector('#animal-sponsor-filter') as HTMLSelectElement;
            
            const applyFilters = () => {
                renderAnimalModal({
                    filter: searchInput.value,
                    sortBy: sortSelect.value,
                    sponsorFilter: sponsorFilterSelect.value
                });
            };
            
            searchInput.addEventListener('input', applyFilters);
            sortSelect.addEventListener('change', applyFilters);
            sponsorFilterSelect.addEventListener('change', applyFilters);
            
            m.querySelector('#add-new-animal-btn').addEventListener('click', () => renderEditAnimalModal());
            m.querySelectorAll('.animal-list-card').forEach(c => c.addEventListener('click', (e) => renderAnimalDetailModal(parseInt((e.currentTarget as HTMLElement).dataset.id))));
        });
    }
    
    async function renderAnimalDetailModal(animalId: number){
        const a=state.animals.find(a=>a.id==animalId);if(!a)return;
        const s=a.sponsorId?state.sponsors.find(s=>s.id===a.sponsorId):null;
        const fallbackImageUrl = `https://placehold.co/300x200/cccccc/4A2E2E?text=${encodeURIComponent(a.name)}`;
        let i=a.imageUrl || fallbackImageUrl;if(a.hasCustomImage){try {const b=await getImage(a.id);if(b){i=createManagedObjectURL(b);}} catch(e){console.error(e);}}
        let content=`<div class="text-center"><img src="${i}" alt="${a.name}" class="detail-image w-48 h-48 object-cover rounded-full mx-auto border-4" style="border-color:${s?sponsorshipColors[s.level]:'#BDC3C7'}"><h2 class="text-3xl font-bold mt-4">${a.name}</h2><div class="my-4">${renderRingIndicator(a)||'<p class="text-sm text-gray-500 mt-1">Kennzeichnung: Blank</p>'}</div><div class="text-left bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg"><h3 class="font-bold text-lg mb-2">Paten-Information</h3>${s?`<p><strong>Name:</strong> ${s.name}</p><p><strong>Modell:</strong> ${s.level}</p>`:'<p>Dieses Tier hat noch keinen Paten.</p>'}</div><div class="mt-6 flex gap-4 justify-center"><button id="back-to-list-btn" class="bg-gray-500 text-white font-bold py-2 px-4 rounded-full">Zurück</button><button id="edit-from-detail-btn" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-full">Bearbeiten</button><button id="delete-from-detail-btn" class="bg-red-500 text-white font-bold py-2 px-4 rounded-full">Löschen</button></div></div>`;
        openModal(content,m=>{m.querySelector('#back-to-list-btn').addEventListener('click',()=>{history.back();});m.querySelector('#edit-from-detail-btn').addEventListener('click',()=>renderEditAnimalModal(animalId));m.querySelector('#delete-from-detail-btn').addEventListener('click',()=>deleteAnimal(animalId,true));});
    }

    // FIX: Type options parameter.
    interface RenderSponsorModalOptions { filter?: string; sortBy?: string; levelFilter?: string; }
    async function renderSponsorModal(options: RenderSponsorModalOptions={}){
        const{filter='',sortBy='name_asc',levelFilter='alle'}=options;
        let f=state.sponsors;
        if(filter){const s=filter.toLowerCase();f=f.filter(sp=>sp.name.toLowerCase().includes(s));}
        if(levelFilter!=='alle'){f=f.filter(sp=>sp.level===levelFilter);}
        const o:{[key: string]: number} ={"King Edition":1,Gold:2,Silber:3};f.sort((a,b)=>{switch(sortBy){case'name_asc':return a.name.localeCompare(b.name);case'level':return o[a.level]-o[b.level];case'animal_count':const cA=state.animals.filter(an=>an.sponsorId===a.id).length;const cB=state.animals.filter(an=>an.sponsorId===b.id).length;return cB-cA;default:return 0;}});
        const sponsorListPromises = f.map(createSponsorListItemHTML);
        const sponsorListHtml = (await Promise.all(sponsorListPromises)).join('');
        let c=`<h2 class="text-3xl font-bold mb-4">Patenübersicht</h2><div class="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"><input type="text" id="sponsor-search" class="w-full p-2 border rounded-lg sm:col-span-2 lg:col-span-1" placeholder="Suche..." value="${filter}"><select id="sponsor-level-filter" class="w-full p-2 border rounded-lg"><option value="alle" ${levelFilter==='alle'?'selected':''}>Alle Partnerschaften</option><option value="Silber" ${levelFilter==='Silber'?'selected':''}>Silber</option><option value="Gold" ${levelFilter==='Gold'?'selected':''}>Gold</option><option value="King Edition" ${levelFilter==='King Edition'?'selected':''}>King Edition</option></select><select id="sponsor-sort" class="w-full p-2 border rounded-lg"><option value="name_asc" ${sortBy==='name_asc'?'selected':''}>Name (A-Z)</option><option value="level" ${sortBy==='level'?'selected':''}>Patenschafts-Stufe</option><option value="animal_count" ${sortBy==='animal_count'?'selected':''}>Anzahl Patentiere</option></select><button id="add-new-sponsor-btn" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-full hover:bg-blue-600 whitespace-nowrap">Neuer Pate +</button></div><div class="space-y-3">${sponsorListHtml||'<p>Keine Paten gefunden.</p>'}</div>`;
        openModal(c,m=>{const i=m.querySelector('#sponsor-search') as HTMLInputElement,s=m.querySelector('#sponsor-sort') as HTMLSelectElement,l=m.querySelector('#sponsor-level-filter') as HTMLSelectElement;const r=()=>{renderSponsorModal({filter:i.value,sortBy:s.value,levelFilter:l.value});};i.addEventListener('input',r);s.addEventListener('change',r);l.addEventListener('change',r);m.querySelector('#add-new-sponsor-btn').addEventListener('click',()=>renderEditSponsorModal());m.querySelectorAll('.sponsor-list-card').forEach(c=>c.addEventListener('click',(e)=>renderSponsorDetailModal(parseInt((e.currentTarget as HTMLElement).dataset.id))));});
    }

    async function renderSponsorDetailModal(sponsorId: number){
        const s=state.sponsors.find(s=>s.id==sponsorId);if(!s)return;
        const fallbackImageHtml = `<div class="w-48 h-48 rounded-full mx-auto border-4 flex items-center justify-center" style="border-color:${sponsorshipColors[s.level]};background-color:${sponsorshipColors[s.level]};"><span class="text-white font-bold text-7xl">${s.name.charAt(0)}</span></div>`;
        let i=fallbackImageHtml;if(s.hasCustomImage){try {const b=await getImage(s.id);if(b){const u=createManagedObjectURL(b);i=`<img src="${u}" alt="${s.name}" class="detail-image w-48 h-48 object-cover rounded-full mx-auto border-4" style="border-color:${sponsorshipColors[s.level]}">`;}} catch(e){console.error(e)}}
        const a=state.animals.filter(a=>a.sponsorId===s.id);
        let c=`<div class="text-center">${i}<h2 class="text-3xl font-bold mt-4">${s.name}</h2><p class="text-lg text-gray-600 dark:text-gray-400">Modell: ${s.level}</p><div class="text-left bg-white/50 dark:bg-gray-800/50 p-4 rounded-lg mt-4"><h3 class="font-bold text-lg mb-2">Patentiere</h3>${a.length>0?`<ul>${a.map(an=>`<li>- ${an.name} (${an.species==='chicken'?'Huhn':'Ente'})</li>`).join('')}</ul>`:'<p>Dieser Pate hat noch keine Tiere.</p>'}</div><div class="mt-6 flex gap-4 justify-center"><button id="back-to-sponsor-list-btn" class="bg-gray-500 text-white font-bold py-2 px-4 rounded-full">Zurück</button><button id="edit-sponsor-from-detail-btn" class="bg-blue-500 text-white font-bold py-2 px-4 rounded-full">Bearbeiten</button><button id="delete-sponsor-from-detail-btn" class="bg-red-500 text-white font-bold py-2 px-4 rounded-full">Löschen</button></div></div>`;
        openModal(c,m=>{m.querySelector('#back-to-sponsor-list-btn').addEventListener('click',()=>{history.back();});m.querySelector('#edit-sponsor-from-detail-btn').addEventListener('click',()=>renderEditSponsorModal(sponsorId));m.querySelector('#delete-sponsor-from-detail-btn').addEventListener('click',()=>deleteSponsor(sponsorId,true));});
    }
    
    async function renderEditAnimalModal(animalId: number = null){
        activeEditSession = {};
        const a=animalId?state.animals.find(a=>a.id==animalId):null;const t=a?'Tier bearbeiten':'Neues Tier anlegen';const p=a?'':funnyAnimalNames[Math.floor(Math.random()*funnyAnimalNames.length)];const s=state.sponsors.map(s=>`<option value="${s.id}" ${a&&a.sponsorId==s.id?'selected':''}>${s.name}</option>`).join('');
        let i='';if(a&&a.hasCustomImage){try{const b=await getImage(a.id);if(b){i=createManagedObjectURL(b);}} catch(e){console.error(e)}}else if(a&&a.imageUrl){i=a.imageUrl;}
        let c=`<h2 class="text-3xl font-bold mb-4">${t}</h2><form id="animal-edit-form" class="space-y-4"><input type="hidden" name="id" value="${a?a.id:''}"><label class="block font-semibold">Name</label><input type="text" name="name" class="w-full p-2 border rounded-lg" value="${a?a.name:''}" placeholder="${p}" required><label class="block font-semibold">Tierart</label><select name="species" class="w-full p-2 border rounded-lg"><option value="chicken" ${a&&a.species==='chicken'?'selected':''}>Huhn</option><option value="duck" ${a&&a.species==='duck'?'selected':''}>Ente</option></select><label class="block font-semibold">Fußring-Kennzeichnung</label><div class="flex items-center gap-2 mt-1"><select name="ringColor" class="w-1/2 p-2 border rounded-lg"><option value="">Keine Farbe</option><option value="red" ${a&&a.ringColor==='red'?'selected':''}>Rot</option><option value="blue" ${a&&a.ringColor==='blue'?'selected':''}>Blau</option><option value="green" ${a&&a.ringColor==='green'?'selected':''}>Grün</option><option value="yellow" ${a&&a.ringColor==='yellow'?'selected':''}>Gelb</option><option value="black" ${a&&a.ringColor==='black'?'selected':''}>Schwarz</option><option value="white" ${a&&a.ringColor==='white'?'selected':''}>Weiß</option></select><input type="number" name="ringCount" min="0" placeholder="Anzahl" class="w-1/2 p-2 border rounded-lg" value="${a&&a.ringCount?a.ringCount:'0'}"></div><label class="block font-semibold">Pate</label><select name="sponsorId" class="w-full p-2 border rounded-lg"><option value="">Kein Pate</option>${s}</select><label class="block font-semibold">Foto</label><input type="file" name="image" accept="image/*" class="hidden" id="image-input"><div class="flex gap-2 mt-1"><button type="button" id="take-photo" class="flex-1 bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">📸 Foto aufnehmen</button><button type="button" id="upload-photo" class="flex-1 bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">📁 Datei hochladen</button></div><div id="image-preview-container" class="mt-2">${i?`<img src="${i}" class="h-20 w-20 object-cover rounded-full">`:''}</div><div class="pt-4"><button type="submit" id="save-btn" class="w-full bg-green-500 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed" ${a ? '' : 'disabled'}>Speichern</button></div></form>`;
        openModal(c,m=>{
            const saveBtn = m.querySelector('#save-btn') as HTMLButtonElement;
            m.querySelector('form').addEventListener('input', () => saveBtn.disabled = false);
            setupImageUploader(m, saveBtn);
            m.querySelector('#animal-edit-form').addEventListener('submit',handleAnimalFormSubmit);
        });
    }
    
    async function renderEditSponsorModal(sponsorId: number=null){
        activeEditSession={};
        const s=sponsorId?state.sponsors.find(s=>s.id==sponsorId):null;const t=s?'Pate bearbeiten':'Neuen Paten anlegen';const p=s?'':funnySponsorNames[Math.floor(Math.random()*funnySponsorNames.length)];
        const availableAnimals = state.animals.filter(animal => animal.sponsorId === null || (s && animal.sponsorId === s.id));
        let aC=availableAnimals.map(a=>{const i=s&&a.sponsorId===s.id;return`<label class="flex items-center space-x-2"><input type="checkbox" name="animalIds" value="${a.id}" ${i?'checked':''} class="rounded"><span>${a.name} (${a.species==='chicken'?'Huhn':'Ente'})</span></label>`;}).join('');
        let i='';if(s&&s.hasCustomImage){try{const b=await getImage(s.id);if(b){i=createManagedObjectURL(b);}}catch(e){console.error(e)}}
        let c=`<h2 class="text-3xl font-bold mb-4">${t}</h2><form id="sponsor-edit-form" class="space-y-4"><input type="hidden" name="id" value="${s?s.id:''}"><label class="block font-semibold">Name des Paten</label><input type="text" name="name" class="w-full p-2 border rounded-lg" value="${s?s.name:''}" placeholder="${p}" required><label class="block font-semibold">Patenschaftsmodell</label><select name="level" class="w-full p-2 border rounded-lg"><option value="Silber" ${s&&s.level==='Silber'?'selected':''}>Silber</option><option value="Gold" ${s&&s.level==='Gold'?'selected':''}>Gold</option><option value="King Edition" ${s&&s.level==='King Edition'?'selected':''}>King Edition</option></select><label class="block font-semibold">Zugeordnete Tiere</label><div class="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 mt-1">${aC||'<p class="text-gray-500">Keine Tiere vorhanden.</p>'}</div><label class="block font-semibold">Foto des Paten (optional)</label><input type="file" name="image" accept="image/*" class="hidden" id="image-input"><div class="flex gap-2 mt-1"><button type="button" id="take-photo" class="flex-1 bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">📸 Foto aufnehmen</button><button type="button" id="upload-photo" class="flex-1 bg-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded-lg hover:bg-gray-300">📁 Datei hochladen</button></div><div id="image-preview-container" class="mt-2">${i?`<img src="${i}" class="h-20 w-20 object-cover rounded-full">`:''}</div><div class="pt-4"><button type="submit" id="save-btn" class="w-full bg-green-500 text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed" ${s ? '' : 'disabled'}>Speichern</button></div></form>`;
        openModal(c,m=>{
            const saveBtn = m.querySelector('#save-btn') as HTMLButtonElement;
            m.querySelector('form').addEventListener('input', () => saveBtn.disabled = false);
            setupImageUploader(m, saveBtn);
            m.querySelector('#sponsor-edit-form').addEventListener('submit',handleSponsorFormSubmit);
        });
    }
    
    // --- DATA HANDLING ---
    // FIX: Type event and cast input elements.
    function handleEggFormSubmit(e: Event){e.preventDefault();const c=parseInt((document.getElementById('chicken-eggs') as HTMLInputElement).value)||0;const d=parseInt((document.getElementById('duck-eggs') as HTMLInputElement).value)||0;const t=getFormattedDate(new Date());const i=state.eggLogs.findIndex(l=>l.date===t);if(i>-1){state.eggLogs[i].chicken=c;state.eggLogs[i].duck=d;}else{state.eggLogs.push({date:t,chicken:c,duck:d});}saveState();renderDashboard();(e.target as HTMLFormElement).reset();}
    
    // FIX: Type event and cast form data values.
    async function handleAnimalFormSubmit(e: Event) {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const id = formData.get('id') ? parseInt(formData.get('id') as string) : null;
        const newImageBlob = activeEditSession.newImageBlob;
        const name = (formData.get('name') as string).trim();
        if (!name) return showAlert("Der Name darf nicht leer sein.");
        const ringColor = formData.get('ringColor') as string;
        const ringCount = parseInt(formData.get('ringCount') as string) || 0;

        if (ringColor && ringCount > 0 && state.animals.find(a => a.id !== id && a.ringColor === ringColor && a.ringCount === ringCount)) { return showAlert(`FEHLER: Diese Ring-Kennzeichnung ist bereits vergeben.`); }
        if (state.animals.find(a => a.id !== id && a.name.toLowerCase() === name.toLowerCase())) { return showAlert(`Ein Tier mit dem Namen '${name}' existiert bereits.`); }

        let animal: Animal;
        if (id) {
            animal = state.animals.find(a => a.id === id)!;
        } else {
            animal = { id: Date.now(), createdAt: Date.now(), name: '', species: 'chicken', sponsorId: null, ringColor: '', ringCount: 0, hasCustomImage: false };
            state.animals.push(animal);
        }

        animal.name = name;
        animal.species = formData.get('species') as 'chicken' | 'duck';
        animal.sponsorId = formData.get('sponsorId') ? parseInt(formData.get('sponsorId') as string) : null;
        animal.ringColor = ringColor;
        animal.ringCount = ringCount;
        if (!id && !newImageBlob) {
            animal.hasCustomImage = false;
            animal.imageUrl = `https://placehold.co/300x200/cccccc/4A2E2E?text=${animal.name}`;
        }
        
        if (newImageBlob) {
            try {
                await saveImage(animal.id, newImageBlob);
                animal.hasCustomImage = true;
                delete animal.imageUrl;
            } catch (error) {
                console.error("Image save error:", error);
                showAlert("Profildaten gespeichert, aber das Bild konnte nicht gesichert werden.");
            }
        }
        
        await saveState();
        activeEditSession = {};
        history.back();
        renderDashboard();
        if (document.querySelector('#animal-search')) renderAnimalModal();
    }

    // FIX: Type event and cast form data values.
    async function handleSponsorFormSubmit(e: Event) {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const id = formData.get('id') ? parseInt(formData.get('id') as string) : null;
        const newImageBlob = activeEditSession.newImageBlob;
        const assignedAnimalIds = Array.from(formData.getAll('animalIds')).map(id => parseInt(id as string));
        const name = (formData.get('name') as string).trim();
        if (!name) return showAlert("Der Name darf nicht leer sein.");

        let sponsor: Sponsor;
        if (id) {
            sponsor = state.sponsors.find(s => s.id === id)!;
        } else {
            sponsor = { id: Date.now(), createdAt: Date.now(), name: '', level: 'Silber', hasCustomImage: false };
            state.sponsors.push(sponsor);
        }
        
        sponsor.name = name;
        sponsor.level = formData.get('level') as "Silber" | "Gold" | "King Edition";
        if (!id && !newImageBlob) {
            sponsor.hasCustomImage = false;
        }

        state.animals.forEach(animal => {
            if (animal.sponsorId === sponsor.id && !assignedAnimalIds.includes(animal.id)) { animal.sponsorId = null; }
            if (assignedAnimalIds.includes(animal.id)) { animal.sponsorId = sponsor.id; }
        });
        
        if (newImageBlob) {
            try {
                await saveImage(sponsor.id, newImageBlob);
                sponsor.hasCustomImage = true;
            } catch (error) {
                console.error("Image save error:", error);
                showAlert("Patendaten gespeichert, aber das Bild konnte nicht gesichert werden.");
            }
        }
        
        await saveState();
        activeEditSession = {};
        history.back();
        renderDashboard();
        if (document.querySelector('#sponsor-search')) renderSponsorModal();
    }

    async function deleteAnimal(animalId: number, fromDetail = false) {
        if (await showConfirmation('Bist du sicher, dass du dieses Tier löschen möchtest?')) {
            const animal = state.animals.find(a => a.id == animalId);
            if (animal && animal.hasCustomImage) await deleteImage(animalId);
            state.animals = state.animals.filter(a => a.id != animalId);
            await saveState();
            renderDashboard();
            if(fromDetail) { history.back(); } else { renderAnimalModal(); }
        }
    }
    
    async function deleteSponsor(sponsorId: number, fromDetail = false) {
        if (await showConfirmation('Bist du sicher? Zugeordnete Tiere verlieren ihre Patenschaft.')) {
            const sponsor = state.sponsors.find(s => s.id == sponsorId);
            if (sponsor && sponsor.hasCustomImage) await deleteImage(sponsorId);
            state.sponsors = state.sponsors.filter(s => s.id != sponsorId);
            state.animals.forEach(animal => { if (animal.sponsorId == sponsorId) animal.sponsorId = null; });
            await saveState();
            renderDashboard();
            if(fromDetail) { history.back(); } else { renderSponsorModal(); }
        }
    }
    
    async function deleteAllData() {
        const confirmed = await showConfirmation('ACHTUNG: Bist du absolut sicher? Alle Tier-, Paten- und Eierdaten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.');
        if (confirmed) {
            const animalImageIds = state.animals.filter(a => a.hasCustomImage).map(a => a.id);
            const sponsorImageIds = state.sponsors.filter(s => s.hasCustomImage).map(s => s.id);
            const allImageIds = [...animalImageIds, ...sponsorImageIds];

            state.animals = [];
            state.sponsors = [];
            state.eggLogs = [];
            
            try {
                await Promise.all(allImageIds.map(id => deleteImage(id)));
            } catch (error) {
                console.error("Error deleting images from IndexedDB:", error);
                showAlert("Daten gelöscht, aber es gab ein Problem beim Bereinigen der Bilder.");
            }

            await saveState();
            renderDashboard();
            history.back();
            showToast("Alle Daten wurden gelöscht.");
        }
    }
    
    async function exportData(){const a=await Promise.all(state.animals.map(async a=>{const c: any={...a};if(c.hasCustomImage){const b=await getImage(c.id);if(b){c.imageUrl=await blobToBase64(b);}}return c;}));const s=await Promise.all(state.sponsors.map(async s=>{const c: any={...s};if(c.hasCustomImage){const b=await getImage(c.id);if(b){c.imageUrl=await blobToBase64(b);}}return c;}));const aS=XLSX.utils.json_to_sheet(a);const sS=XLSX.utils.json_to_sheet(s);const eS=XLSX.utils.json_to_sheet(state.eggLogs);const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,aS,"Tiere");XLSX.utils.book_append_sheet(w,sS,"Paten");XLSX.utils.book_append_sheet(w,eS,"Eier");XLSX.writeFile(w,"Chicken-App-Daten.xlsx");showToast("Daten werden exportiert!");}
    
    // FIX: Type event and cast file reader result.
    function importData(event: Event){const f=(event.target as HTMLInputElement).files[0];if(!f)return;const r=new FileReader();r.onload=async e=>{const d=new Uint8Array(e.target.result as ArrayBuffer);const w=XLSX.read(d,{type:'array'});try{const iA=XLSX.utils.sheet_to_json(w.Sheets['Tiere']);const iS=XLSX.utils.sheet_to_json(w.Sheets['Paten']);await Promise.all((iA as any[]).map(async a=>{if(a.imageUrl&&a.imageUrl.startsWith('data:image')){const b=await base64ToBlob(a.imageUrl);await saveImage(a.id,b);a.hasCustomImage=true;delete a.imageUrl;}}));await Promise.all((iS as any[]).map(async s=>{if(s.imageUrl&&s.imageUrl.startsWith('data:image')){const b=await base64ToBlob(s.imageUrl);await saveImage(s.id,b);s.hasCustomImage=true;delete s.imageUrl;}}));state.animals=iA as Animal[];state.sponsors=iS as Sponsor[];state.eggLogs=XLSX.utils.sheet_to_json(w.Sheets['Eier']) as EggLog[];await saveState();renderDashboard();history.back();showToast("Daten erfolgreich importiert!");}catch(err){console.error("Import Error:",err);showAlert("Fehler beim Importieren der Datei.");}};r.readAsArrayBuffer(f);}
    
    // --- THEME & INIT ---
    function applyTheme(theme: string){if(theme==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}
    
    async function toggleTheme(){
        const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        try {
            await saveDataToDB('appSettings', 'theme', newTheme);
            applyTheme(newTheme);
        } catch (error) {
            console.error("Failed to save theme:", error);
            showAlert("Theme konnte nicht gespeichert werden.");
        }
    }

    document.getElementById('egg-form').addEventListener('submit', handleEggFormSubmit);
    document.getElementById('card-animals').addEventListener('click', () => renderAnimalModal());
    document.getElementById('card-sponsors').addEventListener('click', () => renderSponsorModal());
    document.getElementById('card-eggs').addEventListener('click', () => renderEggModal());
    document.getElementById('card-data').addEventListener('click', () => renderFileModal());
    document.getElementById('card-add-new').addEventListener('click', renderAddNewModal);
    document.getElementById('card-settings').addEventListener('click', renderSettingsModal);
    document.getElementById('card-unsponsored').addEventListener('click', () => renderAnimalModal({ sponsorFilter: 'none' }));
    document.getElementById('add-animal-shortcut').addEventListener('click', (e) => { e.stopPropagation(); renderEditAnimalModal(); });
    document.getElementById('add-sponsor-shortcut').addEventListener('click', (e) => { e.stopPropagation(); renderEditSponsorModal(); });
    document.getElementById('nav-overview').addEventListener('click', () => { if (isModalOpen) history.back(); });
    document.getElementById('nav-animals').addEventListener('click', () => renderAnimalModal());
    document.getElementById('nav-sponsors').addEventListener('click', () => renderSponsorModal());
    document.getElementById('nav-eggs').addEventListener('click', () => renderEggModal());
    document.getElementById('nav-data').addEventListener('click', () => renderFileModal());
    document.getElementById('nav-unsponsored').addEventListener('click', () => renderAnimalModal({ sponsorFilter: 'none' }));
    document.getElementById('nav-add-new').addEventListener('click', renderAddNewModal);
    document.getElementById('nav-settings').addEventListener('click', renderSettingsModal);
    
    async function init() {
        try {
            await initDB();
            const [theme] = await Promise.all([
                loadDataFromDB('appSettings', 'theme').catch(() => 'light'),
                loadState()
            ]);

            if (state.animals.length === 0 && state.sponsors.length === 0) {
                await addSampleData();
            }

            await loadDashboardOrder();
            renderDashboard();
            applyTheme(theme || 'light');
            
            // Service Worker entfernt - nicht kompatibel mit Single-File-HTML
            // Keine Service Worker Registrierung mehr nötig
            
        } catch (error) {
            console.error("Critical Error on Initialization:", error);
            document.body.innerHTML = `<div style="padding: 2rem; text-align: center; background-color: #fee2e2; color: #b91c1c;"><h1 style="font-size: 1.5rem; font-weight: bold;">Kritischer Fehler</h1><p style="margin-top: 1rem;">Die App konnte nicht initialisiert werden. Dies kann im privaten Browsing-Modus passieren.</p></div>`;
            return; 
        }
    }

    async function addSampleData() {
        console.log("Adding sample data...");
        const sponsors: Sponsor[] = [];
        for (let i = 1; i <= 20; i++) {
            sponsors.push({
                id: Date.now() + i, createdAt: Date.now() + i,
                name: `Pate Nr. ${i}`, level: ["Silber", "Gold", "King Edition"][i % 3] as "Silber" | "Gold" | "King Edition",
                hasCustomImage: false
            });
        }
        state.sponsors = sponsors;

        const animals: Animal[] = [];
        let animalIdCounter = 100;
        for (let i = 1; i <= 30; i++) {
            animals.push({
                id: Date.now() + animalIdCounter++, createdAt: Date.now() + animalIdCounter,
                name: `Huhn ${i}`, species: "chicken", sponsorId: null,
                ringColor: "", ringCount: 0, hasCustomImage: false,
                imageUrl: `https://placehold.co/300x200/cccccc/4A2E2E?text=Huhn+${i}`
            });
        }
        for (let i = 1; i <= 7; i++) {
            animals.push({
                id: Date.now() + animalIdCounter++, createdAt: Date.now() + animalIdCounter,
                name: `Ente ${i}`, species: "duck", sponsorId: null,
                ringColor: "", ringCount: 0, hasCustomImage: false,
                imageUrl: `https://placehold.co/300x200/cccccc/4A2E2E?text=Ente+${i}`
            });
        }
        state.animals = animals;
        
        const chickens = state.animals.filter(a => a.species === 'chicken');
        const ducks = state.animals.filter(a => a.species === 'duck');
        let sponsorIndex = 0;

        for (let i = 0; i < 17; i++) {
            chickens[i].sponsorId = state.sponsors[sponsorIndex % state.sponsors.length].id;
            sponsorIndex++;
        }
        for (let i = 0; i < 4; i++) {
            ducks[i].sponsorId = state.sponsors[sponsorIndex % state.sponsors.length].id;
            sponsorIndex++;
        }

        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            state.eggLogs.push({
                date: getFormattedDate(date),
                chicken: Math.floor(Math.random() * (chickens.length * 0.8)),
                duck: Math.floor(Math.random() * (ducks.length * 0.7))
            });
        }
        
        await saveState();
        console.log("Sample data added and saved.");
    }

    init();
});