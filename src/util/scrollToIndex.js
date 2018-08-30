import EVENTS from '../events.js';
import external from '../externalModules.js';
import { getToolState } from '../stateManagement/toolState.js';
import requestPoolManager from '../requestPool/requestPoolManager.js';
import loadHandlerManager from '../stateManagement/loadHandlerManager.js';
import triggerEvent from '../util/triggerEvent.js';

export default function (element, newImageIdIndex) {
  const toolData = getToolState(element, 'stack');

  if (!toolData || !toolData.data || !toolData.data.length) {
    return;
  }

  const cornerstone = external.cornerstone;
  // If we have more than one stack, check if we have a stack renderer defined
  let stackRenderer;

  if (toolData.data.length > 1) {
    const stackRendererData = getToolState(element, 'stackRenderer');

    if (stackRendererData && stackRendererData.data && stackRendererData.data.length) {
      stackRenderer = stackRendererData.data[0];
    }
  }

  const stackData = toolData.data[0];

  // Allow for negative indexing
  if (newImageIdIndex < 0) {
    newImageIdIndex += stackData.imageIds.length;
  }

  const startLoadingHandler = loadHandlerManager.getStartLoadHandler();
  const endLoadingHandler = loadHandlerManager.getEndLoadHandler();
  const errorLoadingHandler = loadHandlerManager.getErrorLoadingHandler();

  function doneCallback(image) {
    if (stackData.currentImageIdIndex !== newImageIdIndex) {
      return;
    }

    // Check if the element is still enabled in Cornerstone,
    // If an error is thrown, stop here.
    try {
      // TODO: Add 'isElementEnabled' to Cornerstone?
      cornerstone.getEnabledElement(element);
    } catch (error) {
      return;
    }

    if (stackRenderer) {
      stackRenderer.currentImageIdIndex = newImageIdIndex;
      stackRenderer.render(element, toolData.data);
    } else {
      cornerstone.displayImage(element, image);
    }

    if (endLoadingHandler) {
      endLoadingHandler(element, image);
    }
  }

  function failCallback(error) {
    const imageId = stackData.imageIds[newImageIdIndex];

    if (errorLoadingHandler) {
      errorLoadingHandler(element, imageId, error);
    }
  }

  if (newImageIdIndex === stackData.currentImageIdIndex) {
    return;
  }

  if (startLoadingHandler) {
    startLoadingHandler(element);
  }

  const eventData = {
    newImageIdIndex,
    direction: newImageIdIndex - stackData.currentImageIdIndex
  };

  stackData.currentImageIdIndex = newImageIdIndex;
  const newImageId = stackData.imageIds[newImageIdIndex];

  // Convert the preventCache value in stack data to a boolean
  const preventCache = Boolean(stackData.preventCache);

  let imagePromise;

  let voi = undefined;

  let enabledElement = cornerstone.getEnabledElement(element);

  var metadata = stackData.metadataProvider.getMetadata(newImageId);
  var lastMetadata = stackData.metadataProvider.getMetadata(enabledElement.renderingTools.lastRenderedImageId);

  if (enabledElement.renderingTools.lastRenderedViewport) {

    enabledElement.viewport.voi.windowWidth = metadata.instance.windowWidth + (enabledElement.renderingTools.lastRenderedViewport.windowWidth - lastMetadata.instance.windowWidth);

    enabledElement.viewport.voi.windowCenter = metadata.instance.windowCenter + (enabledElement.renderingTools.lastRenderedViewport.windowCenter - lastMetadata.instance.windowCenter);
    
    if (enabledElement.viewport.voi.windowWidth !== lastMetadata.instance.windowWidth &&
        enabledElement.viewport.voi.windowCenter !== lastMetadata.instance.windowCenter) {
      voi = enabledElement.viewport.voi
    }
  }

  if (preventCache) {
    imagePromise = cornerstone.loadImage(newImageId, voi);
  } else {
    imagePromise = cornerstone.loadAndCacheImage(newImageId);
  }

  imagePromise.then(doneCallback, failCallback);
  // Make sure we kick off any changed download request pools
  requestPoolManager.startGrabbing();

  triggerEvent(element, EVENTS.STACK_SCROLL, eventData);
}
