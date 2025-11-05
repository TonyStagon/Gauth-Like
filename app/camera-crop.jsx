import { Camera } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';

export default function CameraCrop() {
  const cameraRef = useRef(null);
  const [hasPermission, setHasPermission] = useState(null);
  const [type, setType] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Set camera type safely when Camera.Constants becomes available
  useEffect(() => {
    if (Camera.Constants?.Type) {
      setType(Camera.Constants.Type.back);
    }
  }, []);

  if (hasPermission === null) {
    return <View />;
  }
  if (hasPermission === false) {
    return <View><Button title="No access to camera" /></View>;
  }

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync();
      console.log('Photo captured:', photo.uri);
    }
  };

  return (
    <View style={styles.container}>
      {(type !== null) && hasPermission && (
        <Camera style={styles.camera} type={type || 'back'} ref={cameraRef}>
          <View style={styles.buttonContainer}>
            <Button
              title="Flip Camera"
              onPress={() => {
                setType(
                  type === Camera.Constants?.Type?.back
                    ? Camera.Constants?.Type?.front || 'front'
                    : Camera.Constants?.Type?.back || 'back'
                );
              }}
            />
            <Button title="Take Photo" onPress={takePicture} />
          </View>
        </Camera>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    justifyContent: 'space-around',
    marginBottom: 30,
  },
});
