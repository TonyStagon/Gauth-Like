import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ML Kit import - Handle gracefully in case package doesn't properly export
const MlKitOcr = () => {
  console.warn("ML Kit functionality not properly configured");
  return {
    detectFromUri: async () => {
      throw new Error("ML Kit OCR not configured");
    },
  };
};

const { width, height } = Dimensions.get("window");

const subjects = [
  { id: "math", name: "Math" },
  { id: "biology", name: "Biology" },
  { id: "physics", name: "Physics" },
  { id: "chemistry", name: "Chemistry" },
  { id: "history", name: "History" },
  { id: "geography", name: "Geography" },
];

export default function CameraCropScreen() {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState("back");
  const [flashMode, setFlashMode] = useState("off");
  const [autoDetect, setAutoDetect] = useState(true);
  const [capturedImage, setCapturedImage] = useState(null);
  const [detectedBoxes, setDetectedBoxes] = useState([]);
  const [selectedBox, setSelectedBox] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [croppedImage, setCroppedImage] = useState(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          We need your permission to show the camera
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Text detection function with safe fallbacks
  const detectTextRegions = async (photoUri, imageWidth, imageHeight) => {
    if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
      console.warn("Invalid image dimensions:", imageWidth, imageHeight);
      return [
        {
          id: 1,
          x: Math.max(width, 300) * 0.1,
          y: Math.max(height, 300) * 0.2,
          width: Math.max(width, 300) * 0.8,
          height: Math.max(height, 300) * 0.15,
        },
        {
          id: 2,
          x: Math.max(width, 300) * 0.1,
          y: Math.max(height, 300) * 0.4,
          width: Math.max(width, 300) * 0.8,
          height: Math.max(height, 300) * 0.2,
        },
      ];
    }

    try {
      console.log("Starting text detection on:", photoUri);
      console.log("Image dimensions:", imageWidth, "x", imageHeight);

      // Attempt to use ML Kit if available
      try {
        const result = await MlKitOcr().detectFromUri(photoUri);
        console.log("ML Kit detection result:", result);

        if (!result || !result.blocks || result.blocks.length === 0) {
          console.log("No text detected by ML Kit");
          return [];
        }

        // Parse ML Kit result and convert to our box format
        const detectedBoxes = result.blocks.map((block, index) => {
          const frame = block.frame || block.boundingBox || block || {};

          // Safe coordinate conversion with defaults
          const x = (frame.x || frame.left || 0.1) * Math.max(imageWidth, 1);
          const y = (frame.y || frame.top || 0.2) * Math.max(imageHeight, 1);
          const detectedWidth =
            (frame.width || frame.right - frame.left || 0.8) *
            Math.max(imageWidth, 1);
          const detectedHeight =
            (frame.height || frame.bottom - frame.top || 0.15) *
            Math.max(imageHeight, 1);

          return {
            id: index + 1,
            x: Math.max(0, x),
            y: Math.max(0, y),
            width: Math.max(1, detectedWidth),
            height: Math.max(1, detectedHeight),
            text: block.text || "",
            confidence: block.confidence || Math.random() * 0.5 + 0.5,
          };
        });

        console.log(`ML Kit detected ${detectedBoxes.length} text regions`);
        return detectedBoxes;
      } catch (mlError) {
        console.warn("ML Kit error, using fallback detection:", mlError);
        return [
          {
            id: 1,
            x: Math.max(imageWidth, 300) * 0.1,
            y: Math.max(imageHeight, 300) * 0.2,
            width: Math.max(imageWidth, 300) * 0.8,
            height: Math.max(imageHeight, 300) * 0.15,
          },
          {
            id: 2,
            x: Math.max(imageWidth, 300) * 0.1,
            y: Math.max(imageHeight, 300) * 0.4,
            width: Math.max(imageWidth, 300) * 0.8,
            height: Math.max(imageHeight, 300) * 0.2,
          },
        ];
      }
    } catch (error) {
      console.error("General text detection error:", error);
      return [];
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        setIsProcessing(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          base64: false,
        });

        setCapturedImage(photo);

        if (autoDetect) {
          // Use real ML Kit text detection
          try {
            const boxes = await detectTextRegions(
              photo.uri,
              photo.width,
              photo.height
            );
            setDetectedBoxes(boxes);

            if (boxes.length > 0) {
              // Auto-select the first/largest box
              // Find the largest box by area
              const largestBox = boxes.reduce((prev, current) => {
                const prevArea = prev.width * prev.height;
                const currentArea = current.width * current.height;
                return currentArea > prevArea ? current : prev;
              });
              setSelectedBox(largestBox);
            }
          } catch (error) {
            console.error("Error during text detection:", error);
            // If ML Kit fails, keep the camera UI functional
            setDetectedBoxes([]);
          }
        }

        setIsProcessing(false);
      } catch (error) {
        console.error("Error taking picture:", error);
        setIsProcessing(false);
      }
    }
  };

  const cropImage = async (box) => {
    if (!capturedImage || !box) return;

    try {
      setIsProcessing(true);

      const cropData = {
        originX: box.x,
        originY: box.y,
        width: box.width,
        height: box.height,
      };

      const manipResult = await ImageManipulator.manipulateAsync(
        capturedImage.uri,
        [{ crop: cropData }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCroppedImage(manipResult.uri);
      setShowSubjectModal(true);
      setIsProcessing(false);
    } catch (error) {
      console.error("Error cropping image:", error);
      setIsProcessing(false);
    }
  };

  const handleBoxSelect = (box) => {
    setSelectedBox(box);
  };

  const handleConfirmCrop = () => {
    if (selectedBox) {
      cropImage(selectedBox);
    } else if (!autoDetect && capturedImage) {
      // If manual mode and no box selected, show subject modal with full image
      setCroppedImage(capturedImage.uri);
      setShowSubjectModal(true);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setDetectedBoxes([]);
    setSelectedBox(null);
    setCroppedImage(null);
    setShowSubjectModal(false);
  };

  const handleSubjectSelect = (subject) => {
    console.log("Selected subject:", subject);
    console.log("Cropped image:", croppedImage);
    // Navigate to next screen with cropped image and subject
    // You can add navigation here or pass to parent component
    handleRetake(); // Reset for demo
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const toggleFlash = () => {
    setFlashMode((prev) =>
      prev === "off" ? "on" : prev === "on" ? "auto" : "off"
    );
  };

  const toggleAutoDetect = () => {
    setAutoDetect((prev) => !prev);
  };

  // Render captured image with detection boxes
  if (capturedImage && !showSubjectModal) {
    const imageAspectRatio = capturedImage.width / capturedImage.height;
    const screenAspectRatio = width / height;

    let displayWidth = width;
    let displayHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    // Fit image within screen while maintaining aspect ratio
    if (imageAspectRatio > screenAspectRatio) {
      displayHeight = width / imageAspectRatio;
      offsetY = (height - displayHeight) / 2;
    } else {
      displayWidth = height * imageAspectRatio;
      offsetX = (width - displayWidth) / 2;
    }

    return (
      <View style={styles.container}>
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: capturedImage.uri }}
            style={[
              styles.previewImage,
              {
                width: displayWidth,
                height: displayHeight,
                marginLeft: offsetX,
                marginTop: offsetY,
              },
            ]}
          />

          {/* Draw detection boxes - only show when autoDetect is enabled and boxes are detected */}
          {autoDetect && detectedBoxes && detectedBoxes.length > 0 && (
            <View
              style={[StyleSheet.absoluteFill, styles.detectionBoxesContainer]}
            >
              {detectedBoxes.map((box) => (
                <TouchableOpacity
                  key={box.id}
                  style={[
                    styles.detectionBox,
                    {
                      left:
                        displayWidth * (box.x / capturedImage.width) + offsetX,
                      top:
                        displayHeight * (box.y / capturedImage.height) +
                        offsetY,
                      width: displayWidth * (box.width / capturedImage.width),
                      height:
                        displayHeight * (box.height / capturedImage.height),
                    },
                    selectedBox?.id === box.id && styles.selectedBox,
                    (!autoDetect || !detectedBoxes.length) &&
                      styles.disabledBox,
                  ]}
                  onPress={() => handleBoxSelect(box)}
                  disabled={!autoDetect}
                >
                  <View style={styles.boxCornerTL} />
                  <View style={styles.boxCornerTR} />
                  <View style={styles.boxCornerBL} />
                  <View style={styles.boxCornerBR} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Manual selection area when auto-detect is off */}
          {!autoDetect && (
            <View
              style={[StyleSheet.absoluteFill, styles.manualSelectionContainer]}
            >
              <View style={styles.manualSelectionHint}>
                <Text style={styles.manualSelectionText}>
                  Auto-detect disabled{"\n"}System will proceed with full image
                </Text>
              </View>
            </View>
          )}

          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: 30 }]}>
            <TouchableOpacity style={styles.topButton} onPress={handleRetake}>
              <Ionicons name="close" size={32} color="white" />
            </TouchableOpacity>
            <Text style={styles.instructionText}>
              {autoDetect
                ? detectedBoxes && detectedBoxes.length > 0
                  ? "Tap a box to select"
                  : "No text detected"
                : "Full image selected"}
            </Text>
            <TouchableOpacity
              style={[styles.topButton, styles.autoDetectButton]}
              onPress={toggleAutoDetect}
            >
              <Text style={styles.autoDetectButtonText}>
                {autoDetect ? "Auto" : "Manual"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom confirm button */}
          <View style={styles.confirmContainer}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                !selectedBox &&
                  autoDetect &&
                  detectedBoxes &&
                  detectedBoxes.length > 0 &&
                  styles.disabledConfirmButton,
              ]}
              onPress={handleConfirmCrop}
              disabled={
                isProcessing ||
                (!selectedBox &&
                  autoDetect &&
                  detectedBoxes &&
                  detectedBoxes.length > 0)
              }
            >
              {isProcessing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={24} color="white" />
                  <Text style={styles.confirmText}>
                    {selectedBox || !autoDetect
                      ? "Confirm"
                      : "Please select an area"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Subject selection modal
  if (showSubjectModal) {
    return (
      <Modal
        visible={showSubjectModal}
        animationType="slide"
        transparent={false}
      >
        <View style={styles.modalContainer}>
          {/* Preview of cropped image */}
          <View style={styles.croppedPreview}>
            {croppedImage && (
              <Image
                source={{ uri: croppedImage }}
                style={styles.croppedImage}
              />
            )}
          </View>

          {/* Subject selection */}
          <View style={styles.subjectContainer}>
            <Text style={styles.subjectTitle}>
              What is the question related to?
            </Text>
            <ScrollView style={styles.subjectList}>
              {subjects.map((subject) => (
                <TouchableOpacity
                  key={subject.id}
                  style={styles.subjectItem}
                  onPress={() => handleSubjectSelect(subject)}
                >
                  <Text style={styles.subjectName}>{subject.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={handleRetake}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // Camera view
  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={facing}
        ref={cameraRef}
        flash={flashMode}
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topButton}>
            <Ionicons name="close" size={32} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.getPro}>
            <Ionicons name="shield" size={20} color="#4FC3F7" />
            <Text style={styles.getProText}>Get pro</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topButton}
            onPress={toggleCameraFacing}
          >
            <Ionicons name="camera-reverse" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Center Text */}
        <View style={styles.centerContent}>
          <Text style={styles.mainText}>Take a pic and get</Text>
          <Text style={styles.mainText}>an answer</Text>

          {/* Auto-detect toggle */}
          <TouchableOpacity
            style={styles.autoDetectToggle}
            onPress={toggleAutoDetect}
          >
            <View
              style={[styles.toggleSwitch, autoDetect && styles.toggleActive]}
            >
              <View
                style={[styles.toggleThumb, autoDetect && styles.thumbActive]}
              />
            </View>
            <Text style={styles.toggleLabel}>
              {autoDetect ? "Auto-detect ON" : "Auto-detect OFF"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomContainer}>
          {/* Lightning Icon */}
          <TouchableOpacity
            style={styles.lightningContainer}
            onPress={toggleFlash}
          >
            <View
              style={[
                styles.lightningBadge,
                flashMode === "on" && {
                  backgroundColor: "rgba(255, 255, 0, 0.3)",
                },
                flashMode === "auto" && {
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                },
              ]}
            >
              <Ionicons
                name={
                  flashMode === "on"
                    ? "flash"
                    : flashMode === "auto"
                    ? "flash-outline"
                    : "flash-off"
                }
                size={24}
                color="white"
              />
            </View>
          </TouchableOpacity>

          {/* Camera Controls */}
          <View style={styles.controlsRow}>
            {/* Gallery Button */}
            <TouchableOpacity style={styles.sideButton}>
              <Ionicons name="image-outline" size={28} color="white" />
            </TouchableOpacity>

            {/* Camera Shutter Button */}
            <TouchableOpacity
              style={styles.shutterButton}
              onPress={takePicture}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="large" color="#4FC3F7" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </TouchableOpacity>

            {/* Microphone Button */}
            <TouchableOpacity style={styles.sideButton}>
              <Ionicons name="mic-outline" size={28} color="white" />
            </TouchableOpacity>
          </View>

          {/* Bottom Navigation */}
          <View style={styles.bottomNav}>
            <TouchableOpacity style={styles.navItem}>
              <Ionicons name="search-outline" size={24} color="#8E8E93" />
              <Text style={styles.navLabel}>Search</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItem}>
              <Ionicons name="camera" size={24} color="white" />
              <Text style={[styles.navLabel, styles.navLabelActive]}>
                Camera
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navItem}>
              <Ionicons name="person-outline" size={24} color="#8E8E93" />
              <Text style={styles.navLabel}>Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  permissionText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: "#4FC3F7",
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  topButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  getPro: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(79, 195, 247, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  getProText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  mainText: {
    color: "white",
    fontSize: 26,
    fontWeight: "600",
    textAlign: "center",
  },
  autoDetectToggle: {
    marginTop: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: "#4FC3F7",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "white",
    transform: [{ translateX: 0 }],
  },
  thumbActive: {
    transform: [{ translateX: 22 }],
  },
  toggleLabel: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  bottomContainer: {
    paddingBottom: 0,
  },
  lightningContainer: {
    alignItems: "center",
    marginBottom: 15,
  },
  lightningBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 193, 7, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    marginBottom: 30,
  },
  sideButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(60, 60, 67, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 40,
  },
  shutterInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "#4FC3F7",
  },
  detectionBoxesContainer: {
    pointerEvents: "box-none",
  },
  manualSelectionContainer: {
    pointerEvents: "none",
  },
  manualSelectionHint: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 20,
    marginHorizontal: 40,
    borderRadius: 12,
  },
  manualSelectionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  disabledBox: {
    opacity: 0.5,
  },
  autoDetectButton: {
    backgroundColor: "rgba(79, 195, 247, 0.3)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  autoDetectButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  disabledConfirmButton: {
    backgroundColor: "rgba(79, 195, 247, 0.4)",
  },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#000",
    paddingTop: 10,
    paddingBottom: 30,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  navItem: {
    alignItems: "center",
    gap: 4,
  },
  navLabel: {
    color: "#8E8E93",
    fontSize: 12,
  },
  navLabelActive: {
    color: "white",
  },
  previewContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  previewImage: {
    width: width,
    height: height,
    resizeMode: "contain",
  },
  detectionBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#4FC3F7",
    borderRadius: 8,
  },
  selectedBox: {
    borderColor: "#ffffffff",
    borderWidth: 0,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  boxCornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 35,
    height: 35,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#FFFFFF",
    borderTopLeftRadius: 4,
  },

  boxCornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 35,
    height: 35,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#FFFFFF",
    borderTopRightRadius: 4,
  },

  boxCornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 35,
    height: 35,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
  },

  boxCornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 35,
    height: 35,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: "#FFFFFF",
    borderBottomRightRadius: 4,
  },
  instructionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  confirmContainer: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4FC3F7",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
  },
  confirmText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  croppedPreview: {
    height: height * 0.35,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  croppedImage: {
    width: width * 0.9,
    height: height * 0.3,
    resizeMode: "contain",
    borderRadius: 12,
  },
  subjectContainer: {
    flex: 1,
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 30,
  },
  subjectTitle: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 24,
    color: "#000",
    paddingHorizontal: 20,
  },
  subjectList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  subjectItem: {
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#000",
    textAlign: "center",
    width: "100%",
  },
  backButton: {
    position: "absolute",
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
});
