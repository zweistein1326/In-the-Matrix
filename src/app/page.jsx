'use client';
import React, { useRef, useEffect, useState } from 'react';

// Helper function to load a script dynamically
const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
};

// This is the main component for the Matrix effect.
const MatrixRain = () => {
    const matrixCanvasRef = useRef(null);
    const videoCanvasRef = useRef(null); // A new canvas for the video feed
    const videoRef = useRef(null);
    const animationFrameId = useRef(null);
    const frameCounter = useRef(0);
    const boundingBoxRef = useRef(null); // To store the bounding box coordinates

    // We use state to manage canvas dimensions and model loading status
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [net, setNet] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [sceneImageData, setSceneImageData] = useState(null); // For the composite tree/grass image

    // Effect for loading scripts, webcam, and the BodyPix model
    useEffect(() => {
        const setup = async () => {
            try {
                // Load TensorFlow.js and Body-Pix scripts
                await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
                await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix');

                // --- Load Scene Images ---
                const treeImage = new Image();
                const grassImage = new Image();
                treeImage.crossOrigin = "Anonymous";
                grassImage.crossOrigin = "Anonymous";

                const treePromise = new Promise((resolve, reject) => {
                    treeImage.onload = resolve;
                    treeImage.onerror = reject;
                });
                const grassPromise = new Promise((resolve, reject) => {
                    grassImage.onload = resolve;
                    grassImage.onerror = reject;
                });
                
                // IMPORTANT: Replace these URLs with direct links to your own images.
                // PNGs with transparent backgrounds are recommended.
                treeImage.src = '/tree.webp';
                grassImage.src = '/grass.png';

                // Once both images are loaded, composite them onto a single canvas
                Promise.all([treePromise, grassPromise]).then(() => {
                    const tempCanvas = document.createElement('canvas');
                    // Use the tree's dimensions as the base for the scene
                    tempCanvas.width = treeImage.width;
                    tempCanvas.height = treeImage.height;
                    const tempCtx = tempCanvas.getContext('2d');

                    // Draw the tree in the middle
                    
                    // Draw the grass at the bottom, spanning the width
                    const grassHeight = grassImage.height * (tempCanvas.width / grassImage.width);

                    tempCtx.drawImage(treeImage, 500 , 0);
                    tempCtx.drawImage(grassImage, 0, tempCanvas.height - grassHeight, tempCanvas.width, grassHeight);

                    // Get the combined image data for the draw loop to use
                    setSceneImageData(tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height));
                }).catch(() => setErrorMessage("Failed to load scene images. Please check the URLs."));


                // Set up webcam
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user' },
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await new Promise((resolve) => {
                        videoRef.current.onloadedmetadata = resolve;
                    });
                    await videoRef.current.play();
                }

                // Load the BodyPix model
                const loadedNet = await window.bodyPix.load({
                    architecture: 'MobileNetV1',
                    outputStride: 16,
                    multiplier: 0.75,
                    quantBytes: 2,
                });
                setNet(loadedNet);
                setIsReady(true);

            } catch (error) {
                console.error("Setup failed:", error);
                if (error.name === "NotAllowedError" || error.name === "NotFoundError") {
                    setErrorMessage("Camera access is required. Please allow camera permissions and refresh.");
                } else {
                    setErrorMessage("Failed to load models or start camera. Please try again.");
                }
            }
        };

        setup();

        return () => {
            // Cleanup: stop video stream and animation
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
            if(animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, []);


    // Effect for handling resize and running the main animation loop
    useEffect(() => {
        if (!isReady || !net) return;

        const matrixCanvas = matrixCanvasRef.current;
        const videoCanvas = videoCanvasRef.current;
        const video = videoRef.current;
        const matrixCtx = matrixCanvas.getContext('2d');
        const videoCtx = videoCanvas.getContext('2d');

        const setAllCanvasDimensions = () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            setDimensions({ width: newWidth, height: newHeight });

            // Set dimensions for both canvases
            matrixCanvas.width = newWidth;
            matrixCanvas.height = newHeight / 2;
            videoCanvas.width = newWidth;
            videoCanvas.height = newHeight / 2;
        };
        setAllCanvasDimensions();
        window.addEventListener('resize', setAllCanvasDimensions);

        const characters = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ❤✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢⣣✤✥✦✧✨✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋';
        const fontSize = 4;
        
        let drops = [];
        let liveSegmentationData = null;
        
        const updateSegmentation = async () => {
            if (net && video && video.readyState >= 3) {
                try {
                    const newSegmentation = await net.segmentPerson(video, {
                        flipHorizontal: true, // Flip horizontally for a mirror-like effect
                        internalResolution: 'medium',
                        segmentationThreshold: 0.5 
                    });
                    if (newSegmentation) {
                       liveSegmentationData = newSegmentation.data;
                       let minX = newSegmentation.width, minY = newSegmentation.height, maxX = 0, maxY = 0;
                       let personFound = false;
                       for (let y = 0; y < newSegmentation.height; y++) {
                           for (let x = 0; x < newSegmentation.width; x++) {
                               const index = y * newSegmentation.width + x;
                               if (newSegmentation.data[index] === 1) {
                                   personFound = true;
                                   if (x < minX) minX = x;
                                   if (y < minY) minY = y;
                                   if (x > maxX) maxX = x;
                                   if (y > maxY) maxY = y;
                               }
                           }
                       }
                       if(personFound){
                            boundingBoxRef.current = {minX, minY, maxX, maxY, width: newSegmentation.width, height: newSegmentation.height};
                       } else {
                            boundingBoxRef.current = null;
                       }
                    }
                } catch(e) {
                    console.error("Segmentation failed", e);
                }
            }
        };
        
        const segmentationInterval = setInterval(updateSegmentation, 100);

        const draw = () => {
            frameCounter.current++;

            // --- Aspect Ratio Calculations ---
            const videoAspectRatio = video.videoWidth / video.videoHeight;
            const containerWidth = dimensions.width;
            const containerHeight = dimensions.height / 2;
            const containerAspectRatio = containerWidth / containerHeight;

            let drawWidth = containerWidth;
            let drawHeight = containerHeight;

            if (videoAspectRatio > containerAspectRatio) {
                drawHeight = containerWidth / videoAspectRatio;
            } else {
                drawWidth = containerHeight * videoAspectRatio;
            }

            const offsetX = (containerWidth - drawWidth) / 2;
            const offsetY = (containerHeight - drawHeight) / 2;

            
            // --- TOP HALF: MATRIX EFFECT ---
            const columns = Math.floor(drawWidth / fontSize);
            const rows = Math.floor(drawHeight / fontSize);
            if (drops.length !== columns) {
                 drops = Array(columns).fill(1).map(() => Math.random() * rows);
            }

            matrixCtx.fillStyle = 'black';
            matrixCtx.fillRect(0, 0, containerWidth, containerHeight); // Clear full canvas for padding
            matrixCtx.font = `${fontSize}px monospace`;
            
            const isFallingFrame = frameCounter.current % 2 === 0;

            for (let i = 0; i < columns; i++) {
                const highlightStartRow = drops[i];

                for (let j = 0; j < rows; j++) {
                    const x = offsetX + i * fontSize;
                    const y = offsetY + j * fontSize;

                    // Check for collision with the live person silhouette
                    let isPerson = false;
                    if (liveSegmentationData && video.videoWidth > 0) {
                        const segX = Math.floor((x - offsetX) * (video.videoWidth / drawWidth));
                        const segY = Math.floor((y - offsetY) * (video.videoHeight / drawHeight));
                        if (liveSegmentationData[segY * video.videoWidth + segX] === 1) {
                            isPerson = true;
                        }
                    }

                    // Check for collision with the scene image (tree/grass)
                    let isSceneObject = false;
                    if (sceneImageData) {
                        const imgX = Math.floor((x - offsetX) * (sceneImageData.width / drawWidth));
                        const imgY = Math.floor((y - offsetY) * (sceneImageData.height / drawHeight));
                        const pixelIndex = (imgY * sceneImageData.width + imgX) * 4;
                        const alpha = sceneImageData.data[pixelIndex + 3];
                        if (alpha > 128) { // Check if pixel is not transparent
                            isSceneObject = true;
                        }
                    }
                    
                    const isObject = isPerson || isSceneObject;
                    const isHighlighted = (j >= highlightStartRow) && (j < highlightStartRow + 10);
                    
                    let opacity = isHighlighted ? 0.5 : (isObject ? 1 : 0.2);
                    const baseColor = isObject ? '0, 255, 17' : '255, 255, 255';

                    matrixCtx.fillStyle = `rgba(${baseColor}, ${opacity})`;
                    const text = characters[Math.floor(Math.random() * characters.length)];
                    matrixCtx.fillText(text, x, y);
                }

                if (isFallingFrame) {
                    drops[i]++;
                    if (drops[i] > rows) {
                        drops[i] = 0 - Math.random() * rows;
                    }
                }
            }

            // --- BOTTOM HALF: VIDEO + BOUNDING BOX ---
            videoCtx.fillStyle = 'black';
            videoCtx.fillRect(0, 0, containerWidth, containerHeight); // Clear full canvas for padding

            videoCtx.save();
            videoCtx.translate(containerWidth, 0);
            videoCtx.scale(-1, 1); // Flip horizontally to create a mirror image
            const flippedOffsetX = containerWidth - offsetX - drawWidth;
            videoCtx.drawImage(video, flippedOffsetX, offsetY, drawWidth, drawHeight);
            videoCtx.restore();

            // Draw bounding box if available
            if (boundingBoxRef.current) {
                const box = boundingBoxRef.current;
                const scaleX = drawWidth / box.width;
                const scaleY = drawHeight / box.height;

                const rectX = box.minX * scaleX;
                const rectY = box.minY * scaleY;
                const rectWidth = (box.maxX - box.minX) * scaleX;
                const rectHeight = (box.maxY - box.minY) * scaleY;
                
                videoCtx.strokeStyle = '#00FF11'; // Bright green
                videoCtx.lineWidth = 4;
                videoCtx.strokeRect(offsetX + rectX, offsetY + rectY, rectWidth, rectHeight);
            }
            
            animationFrameId.current = requestAnimationFrame(draw);
        };

        draw();

        // Cleanup
        return () => {
            window.removeEventListener('resize', setAllCanvasDimensions);
            if(animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            clearInterval(segmentationInterval);
        };
    }, [isReady, net, dimensions.width, dimensions.height, sceneImageData]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'black' }}>
            {errorMessage && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', backgroundColor: 'black', padding: '20px', border: '1px solid red', zIndex: 10 }}>
                    {errorMessage}
                </div>
            )}
            <video ref={videoRef} style={{ display: 'none' }} />
            
            {/* Top half canvas for the Matrix effect */}
            <canvas ref={matrixCanvasRef} style={{ height: '50%', width: '100%', display: 'block' }} />
            
            {/* Bottom half canvas for the video feed */}
            <canvas ref={videoCanvasRef} style={{ height: '50%', width: '100%', display: 'block' , transform: 'scaleX(-1)'}} />

             {!isReady && !errorMessage && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#0f0', fontFamily: 'monospace', zIndex: 10 }}>
                    Loading...
                </div>
            )}
        </div>
    );
};


// The main App component that renders the Matrix effect.
// The main div is removed as the MatrixRain component now controls the full screen layout.
export default function App() {
    return <MatrixRain />;
}
