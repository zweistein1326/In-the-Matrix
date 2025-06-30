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
    const canvasRef = useRef(null);
    const videoRef = useRef(null);
    const animationFrameId = useRef(null);
    const frameCounter = useRef(0);

    // We use state to manage canvas dimensions and model loading status
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [net, setNet] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Effect for loading scripts, webcam, and the BodyPix model
    useEffect(() => {
        const setup = async () => {
            try {
                // Load TensorFlow.js and Body-Pix scripts
                await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
                await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix');

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

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');

        const setCanvasDimensions = () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            setDimensions({ width: newWidth, height: newHeight });
            canvas.width = newWidth;
            canvas.height = newHeight;
        };
        setCanvasDimensions();
        window.addEventListener('resize', setCanvasDimensions);

        const characters = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ❤✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧✨✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋';
        const fontSize = 16;
        const columns = Math.floor(dimensions.width / fontSize);
        const rows = Math.floor(dimensions.height / fontSize);
        
        const drops = Array(columns).fill(1).map(() => Math.random() * rows);

        let segmentationData = null;
        let glitchStartFrame = 0;
        const glitchDuration = 2; // The glitch will now last for 2 frames

        const updateSegmentation = async () => {
            if (net && video && video.readyState >= 3) {
                try {
                    const newSegmentation = await net.segmentPerson(video, {
                        flipHorizontal: false,
                        internalResolution: 'medium',
                        segmentationThreshold: 0.5 
                    });
                    if (newSegmentation) {
                       segmentationData = newSegmentation.data;
                    }
                } catch(e) {
                    console.error("Segmentation failed", e);
                }
            }
        };
        
        const segmentationInterval = setInterval(updateSegmentation, 100);

        const draw = () => {
            frameCounter.current++;
            
            // Randomly trigger a glitch effect. Probability is set to average once every ~30 seconds (1/1800 frames @ 60fps)
            if (glitchStartFrame === 0 && Math.random() < 1/1800) {
                glitchStartFrame = frameCounter.current;
            }

            // Check if we are currently inside the glitch period
            if (glitchStartFrame > 0 && frameCounter.current < glitchStartFrame + glitchDuration) {
                // GLITCH EFFECT: Draw the raw camera feed
                ctx.save();
                ctx.translate(dimensions.width, 0);
                ctx.scale(-1, 1); // Flip for a mirror effect
                ctx.drawImage(video, 0, 0, dimensions.width, dimensions.height);
                ctx.restore();
            } else {
                // Once the glitch is over, reset the start frame
                if (glitchStartFrame > 0) {
                    glitchStartFrame = 0;
                }
                
                // NORMAL MATRIX EFFECT
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, dimensions.width, dimensions.height);
                ctx.font = `${fontSize}px monospace`;
                
                const isFallingFrame = frameCounter.current % 2 === 0;

                for (let i = 0; i < columns; i++) {
                    const highlightStartRow = drops[i];

                    for (let j = 0; j < rows; j++) {
                        const x = i * fontSize;
                        const y = j * fontSize;

                        const isHighlighted = (j >= highlightStartRow) && (j < highlightStartRow + 10);
                        
                        let isPerson = false;
                        if (segmentationData && video.videoWidth > 0) {
                            const videoWidth = video.videoWidth;
                            const videoHeight = video.videoHeight;
                            const segX = Math.floor(x * (videoWidth / dimensions.width));
                            const segY = Math.floor(y * (videoHeight / dimensions.height));
                            
                            if (segmentationData[segY * videoWidth + segX] === 1) {
                                isPerson = true;
                            }
                        }
                        
                        let opacity;
                        if (isHighlighted) {
                            opacity = 1.0;
                        } else {
                            if (isPerson) {
                                opacity = 0.4;
                            } else {
                                opacity = 0.2;
                            }
                        }

                        const baseColor = isPerson ? '255, 255, 255' : '0, 255, 17';

                        ctx.fillStyle = `rgba(${baseColor}, ${opacity})`;
                        const text = characters[Math.floor(Math.random() * characters.length)];
                        ctx.fillText(text, x, y);
                    }

                    if (isFallingFrame) {
                        drops[i]++;
                        if (drops[i] > rows) {
                            drops[i] = 0 - Math.random() * rows;
                        }
                    }
                }
            }
            
            animationFrameId.current = requestAnimationFrame(draw);
        };

        draw();

        // Cleanup
        return () => {
            window.removeEventListener('resize', setCanvasDimensions);
            if(animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            clearInterval(segmentationInterval);
        };
    }, [isReady, net, dimensions.width, dimensions.height]);

    return (
        <div>
            {errorMessage && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'red', backgroundColor: 'black', padding: '20px', border: '1px solid red', zIndex: 10 }}>
                    {errorMessage}
                </div>
            )}
            <video
                ref={videoRef}
                style={{
                    display: 'none',
                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    background: '#000',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 0,
                }}
            />
             {!isReady && !errorMessage && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#0f0', fontFamily: 'monospace', zIndex: 10 }}>
                    Loading models...
                </div>
            )}
        </div>
    );
};


// The main App component that renders the Matrix effect.
export default function App() {
    return (
        <div style={{
            backgroundColor: 'black',
            minHeight: '100vh',
            overflow: 'hidden'
        }}>
            <MatrixRain />
        </div>
    );
}
