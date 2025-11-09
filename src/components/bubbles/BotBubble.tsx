import { createEffect, Show, createSignal, onMount, For } from 'solid-js';
import { Avatar } from '../avatars/Avatar';
import { Marked } from '@ts-stack/markdown';
import { FeedbackRatingType, sendFeedbackQuery, sendFileDownloadQuery, updateFeedbackQuery } from '@/queries/sendMessageQuery';
import { FileUpload, IAction, MessageType } from '../Bot';
import { CopyToClipboardButton, ThumbsDownButton, ThumbsUpButton } from '../buttons/FeedbackButtons';
import { TTSButton } from '../buttons/TTSButton';
import FeedbackContentDialog from '../FeedbackContentDialog';
import { AgentReasoningBubble } from './AgentReasoningBubble';
import { TickIcon, XIcon } from '../icons';
import { SourceBubble } from '../bubbles/SourceBubble';
import { DateTimeToggleTheme } from '@/features/bubble/types';
import { WorkflowTreeView } from '../treeview/WorkflowTreeView';

type Props = {
  message: MessageType;
  chatflowid: string;
  chatId: string;
  apiHost?: string;
  onRequest?: (request: RequestInit) => Promise<void>;
  fileAnnotations?: any;
  showAvatar?: boolean;
  avatarSrc?: string;
  backgroundColor?: string;
  textColor?: string;
  chatFeedbackStatus?: boolean;
  fontSize?: number;
  feedbackColor?: string;
  isLoading: boolean;
  dateTimeToggle?: DateTimeToggleTheme;
  showAgentMessages?: boolean;
  sourceDocsTitle?: string;
  renderHTML?: boolean;
  handleActionClick: (elem: any, action: IAction | undefined | null) => void;
  handleSourceDocumentsClick: (src: any) => void;
  // TTS props
  isTTSEnabled?: boolean;
  isTTSLoading?: Record<string, boolean>;
  isTTSPlaying?: Record<string, boolean>;
  handleTTSClick?: (messageId: string, messageText: string) => void;
  handleTTSStop?: (messageId: string) => void;
};

const defaultBackgroundColor = '#f7f8ff';
const defaultTextColor = '#303235';
const defaultFontSize = 16;
const defaultFeedbackColor = '#3B81F6';

export const BotBubble = (props: Props) => {
  let botDetailsEl: HTMLDetailsElement | undefined;

  Marked.setOptions({ isNoP: true, sanitize: props.renderHTML !== undefined ? !props.renderHTML : true });

  const [rating, setRating] = createSignal('');
  const [feedbackId, setFeedbackId] = createSignal('');
  const [showFeedbackContentDialog, setShowFeedbackContentModal] = createSignal(false);
  const [copiedMessage, setCopiedMessage] = createSignal(false);
  const [thumbsUpColor, setThumbsUpColor] = createSignal(props.feedbackColor ?? defaultFeedbackColor); // default color
  const [thumbsDownColor, setThumbsDownColor] = createSignal(props.feedbackColor ?? defaultFeedbackColor); // default color

  // Store a reference to the bot message element for the copyMessageToClipboard function
  const [botMessageElement, setBotMessageElement] = createSignal<HTMLElement | null>(null);

  const isFullHTMLDocument = (content: string): boolean => {
    const trimmed = content.trim();
    return trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || /^\s*<html[\s>]/i.test(trimmed);
  };

  const isCompleteHTMLDocument = (content: string): boolean => {
    // Check if HTML document has closing tags (meaning it's complete)
    const hasClosingBody = content.includes('</body>');
    const hasClosingHtml = content.includes('</html>');
    return hasClosingBody && hasClosingHtml;
  };

  const needsIframeRendering = (content: string): boolean => {
    // Only use iframe for complex HTML with scripts, canvas, or interactive elements
    const hasScript = content.includes('<script');
    const hasCanvas = content.includes('<canvas');
    const hasChartJS = content.includes('chart.js') || content.includes('Chart.js');
    const hasInteractiveLib = content.includes('d3.js') || content.includes('plotly');

    return hasScript || hasCanvas || hasChartJS || hasInteractiveLib;
  };

  const extractTextFromIncompleteHTML = (content: string): string => {
    // For incomplete HTML during streaming, extract visible text and hide raw tags
    try {
      // Try to parse even incomplete HTML to extract text
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const bodyText = doc.body?.textContent || '';

      // If we extracted meaningful text, show it with a loading indicator
      if (bodyText.trim().length > 0) {
        return bodyText.trim() + ' ⏳';
      }

      // Otherwise show a loading message
      return 'Loading content... ⏳';
    } catch (e) {
      return 'Loading content... ⏳';
    }
  };

  const setBotMessageRef = (el: HTMLSpanElement) => {
    if (el) {
      const messageContent = props.message.message;

      // Only use iframe for complex HTML (charts, scripts) that needs isolation
      // Simple HTML gets rendered normally without iframe
      if (props.renderHTML && isFullHTMLDocument(messageContent) && isCompleteHTMLDocument(messageContent) && needsIframeRendering(messageContent)) {
        // Create an iframe to render the full HTML document
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.border = 'none';
        iframe.style.outline = 'none';
        iframe.style.display = 'block';
        iframe.style.overflow = 'hidden';
        iframe.style.height = '600px'; // Initial height reservation
        iframe.style.backgroundColor = 'transparent';
        iframe.style.opacity = '0'; // Hide initially to prevent blinking
        iframe.style.transition = 'opacity 0.3s ease-in'; // Smooth fade-in
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.setAttribute('scrolling', 'no');

        // Clear the element and append the iframe
        el.innerHTML = '';
        el.style.overflow = 'hidden';
        el.appendChild(iframe);

        // Function to resize iframe based on content - called once after content loads
        const resizeIframe = () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && iframeDoc.body) {
              const iframeBody = iframeDoc.body;
              const iframeHtml = iframeDoc.documentElement;

              // Remove scrollbars from iframe content
              iframeBody.style.margin = '0';
              iframeBody.style.padding = '10px';
              iframeBody.style.overflow = 'hidden';
              iframeBody.style.boxSizing = 'border-box';
              iframeHtml.style.overflow = 'hidden';

              const height = Math.max(
                iframeBody.scrollHeight || 0,
                iframeBody.offsetHeight || 0,
                iframeHtml.scrollHeight || 0,
                iframeHtml.offsetHeight || 0,
                500, // minimum height
              );

              // Set final height and fade in smoothly - no layout shift visible
              iframe.style.height = height + 'px';
              iframe.style.opacity = '1';
            }
          } catch (e) {
            console.warn('Could not resize iframe:', e);
            // Still show the iframe even if resize fails
            iframe.style.opacity = '1';
          }
        };

        // Function to inject custom CSS into iframe to make content full width
        const injectCustomCSS = () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc) {
              const style = iframeDoc.createElement('style');
              style.textContent = `
                body { 
                  margin: 0 !important; 
                  padding: 10px !important; 
                  overflow: hidden !important;
                  box-sizing: border-box !important;
                }
                html { 
                  overflow: hidden !important; 
                }
                .chart-container,
                div[class*="chart"],
                div[class*="container"] { 
                  width: 100% !important; 
                  max-width: 100% !important;
                  margin-left: 0 !important;
                  margin-right: 0 !important;
                }
                canvas {
                  max-width: 100% !important;
                }
                h1 {
                  margin-top: 10px !important;
                  text-align: center !important;
                }
              `;
              iframeDoc.head.appendChild(style);
            }
          } catch (e) {
            console.warn('Could not inject CSS into iframe:', e);
          }
        };

        // Use setTimeout to ensure iframe is fully mounted before writing content
        setTimeout(() => {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            // Inject CSS directly into the HTML content before writing
            const cssOverride = `
              <style id="flowise-iframe-override">
                * { box-sizing: border-box !important; }
                html { 
                  overflow: hidden !important; 
                  margin: 0 !important;
                  padding: 0 !important;
                }
                body { 
                  margin: 0 !important; 
                  padding: 15px !important; 
                  overflow: hidden !important;
                  box-sizing: border-box !important;
                }
                .chart-container,
                div[class*="chart"],
                div[class*="container"] { 
                  width: 100% !important; 
                  max-width: 100% !important;
                  margin-left: 0 !important;
                  margin-right: 0 !important;
                  padding: 0 5% !important;
                }
                canvas {
                  max-width: 100% !important;
                  width: 100% !important;
                }
                h1 {
                  margin-top: 10px !important;
                  text-align: center !important;
                  font-size: 1.5em !important;
                }
              </style>
            `;

            // Insert CSS at the END of <head> tag so it overrides all other styles
            let modifiedContent = messageContent;
            if (messageContent.includes('</head>')) {
              modifiedContent = messageContent.replace('</head>', cssOverride + '</head>');
            } else if (messageContent.includes('</style>')) {
              // If no </head> but has </style>, insert after the last </style>
              const lastStyleIndex = messageContent.lastIndexOf('</style>');
              modifiedContent = messageContent.slice(0, lastStyleIndex + 8) + cssOverride + messageContent.slice(lastStyleIndex + 8);
            } else if (messageContent.includes('<head>')) {
              modifiedContent = messageContent.replace('<head>', '<head>' + cssOverride);
            } else {
              modifiedContent = cssOverride + messageContent;
            }

            // Replace Mappls Maps API key placeholder with actual key
            if (modifiedContent.includes('GOOGLE_MAP_KEY')) {
              modifiedContent = modifiedContent.replace(/GOOGLE_MAP_KEY/g, 'abc');
            }

            iframeDoc.open();
            iframeDoc.write(modifiedContent);
            iframeDoc.close();

            // Resize only once after Chart.js has fully rendered (2 seconds)
            // This prevents the shaking/blinking caused by multiple resize attempts
            setTimeout(() => {
              resizeIframe();
            }, 2000);
          }
        }, 0);

        // Store the element ref for the copy function
        setBotMessageElement(el);
      } else if (
        props.renderHTML &&
        isFullHTMLDocument(messageContent) &&
        isCompleteHTMLDocument(messageContent) &&
        !needsIframeRendering(messageContent)
      ) {
        // Simple HTML document without scripts/canvas - extract and render body content
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(messageContent, 'text/html');
          const bodyContent = doc.body?.innerHTML || messageContent;
          el.innerHTML = bodyContent;

          // Apply consistent text styling
          const textColor = props.textColor ?? defaultTextColor;
          el.querySelectorAll('a, h1, h2, h3, h4, h5, h6, strong, em, blockquote, li, p').forEach((element) => {
            (element as HTMLElement).style.color = textColor;
          });
          el.querySelectorAll('a').forEach((link) => {
            link.target = '_blank';
          });
        } catch (e) {
          console.warn('Failed to parse HTML, falling back to markdown:', e);
          el.innerHTML = Marked.parse(messageContent);
        }

        // Store the element ref for the copy function
        setBotMessageElement(el);
      } else if (props.renderHTML && isFullHTMLDocument(messageContent) && !isCompleteHTMLDocument(messageContent)) {
        // Incomplete HTML during streaming - extract and show text, hide raw tags
        const extractedText = extractTextFromIncompleteHTML(messageContent);
        el.textContent = extractedText;

        // Store the element ref for the copy function
        setBotMessageElement(el);
      } else {
        // Regular markdown/HTML content processing
        el.innerHTML = Marked.parse(messageContent);

        // Apply textColor to all links, headings, and other markdown elements except code
        const textColor = props.textColor ?? defaultTextColor;
        el.querySelectorAll('a, h1, h2, h3, h4, h5, h6, strong, em, blockquote, li').forEach((element) => {
          (element as HTMLElement).style.color = textColor;
        });

        // Code blocks (with pre) get white text
        el.querySelectorAll('pre').forEach((element) => {
          (element as HTMLElement).style.color = '#FFFFFF';
          // Also ensure any code elements inside pre have white text
          element.querySelectorAll('code').forEach((codeElement) => {
            (codeElement as HTMLElement).style.color = '#FFFFFF';
          });
        });

        // Inline code (not in pre) gets green text
        el.querySelectorAll('code:not(pre code)').forEach((element) => {
          (element as HTMLElement).style.color = '#4CAF50'; // Green color
        });

        // Set target="_blank" for links
        el.querySelectorAll('a').forEach((link) => {
          link.target = '_blank';
        });

        // Store the element ref for the copy function
        setBotMessageElement(el);
      }

      if (props.message.rating) {
        setRating(props.message.rating);
        if (props.message.rating === 'THUMBS_UP') {
          setThumbsUpColor('#006400');
        } else if (props.message.rating === 'THUMBS_DOWN') {
          setThumbsDownColor('#8B0000');
        }
      }
      if (props.fileAnnotations && props.fileAnnotations.length) {
        for (const annotations of props.fileAnnotations) {
          const button = document.createElement('button');
          button.textContent = annotations.fileName;
          button.className =
            'py-2 px-4 mb-2 justify-center font-semibold text-white focus:outline-none flex items-center disabled:opacity-50 disabled:cursor-not-allowed disabled:brightness-100 transition-all filter hover:brightness-90 active:brightness-75 file-annotation-button';
          button.addEventListener('click', function () {
            downloadFile(annotations);
          });
          const svgContainer = document.createElement('div');
          svgContainer.className = 'ml-2';
          svgContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-download" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="#ffffff" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 11l5 5l5 -5" /><path d="M12 4l0 12" /></svg>`;

          button.appendChild(svgContainer);
          el.appendChild(button);
        }
      }
    }
  };

  const downloadFile = async (fileAnnotation: any) => {
    try {
      const response = await sendFileDownloadQuery({
        apiHost: props.apiHost,
        body: { fileName: fileAnnotation.fileName, chatflowId: props.chatflowid, chatId: props.chatId } as any,
        onRequest: props.onRequest,
      });
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileAnnotation.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const copyMessageToClipboard = async () => {
    try {
      const text = botMessageElement() ? botMessageElement()?.textContent : '';
      await navigator.clipboard.writeText(text || '');
      setCopiedMessage(true);
      setTimeout(() => {
        setCopiedMessage(false);
      }, 2000); // Hide the message after 2 seconds
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const saveToLocalStorage = (rating: FeedbackRatingType) => {
    const chatDetails = localStorage.getItem(`${props.chatflowid}_EXTERNAL`);
    if (!chatDetails) return;
    try {
      const parsedDetails = JSON.parse(chatDetails);
      const messages: MessageType[] = parsedDetails.chatHistory || [];
      const message = messages.find((msg) => msg.messageId === props.message.messageId);
      if (!message) return;
      message.rating = rating;
      localStorage.setItem(`${props.chatflowid}_EXTERNAL`, JSON.stringify({ ...parsedDetails, chatHistory: messages }));
    } catch (e) {
      return;
    }
  };

  const isValidURL = (url: string): URL | undefined => {
    try {
      return new URL(url);
    } catch (err) {
      return undefined;
    }
  };

  const removeDuplicateURL = (message: MessageType) => {
    const visitedURLs: string[] = [];
    const newSourceDocuments: any = [];

    message.sourceDocuments.forEach((source: any) => {
      if (isValidURL(source.metadata.source) && !visitedURLs.includes(source.metadata.source)) {
        visitedURLs.push(source.metadata.source);
        newSourceDocuments.push(source);
      } else if (!isValidURL(source.metadata.source)) {
        newSourceDocuments.push(source);
      }
    });
    return newSourceDocuments;
  };

  const onThumbsUpClick = async () => {
    if (rating() === '') {
      const body = {
        chatflowid: props.chatflowid,
        chatId: props.chatId,
        messageId: props.message?.messageId as string,
        rating: 'THUMBS_UP' as FeedbackRatingType,
        content: '',
      };
      const result = await sendFeedbackQuery({
        chatflowid: props.chatflowid,
        apiHost: props.apiHost,
        body,
        onRequest: props.onRequest,
      });

      if (result.data) {
        const data = result.data as any;
        let id = '';
        if (data && data.id) id = data.id;
        setRating('THUMBS_UP');
        setFeedbackId(id);
        setShowFeedbackContentModal(true);
        // update the thumbs up color state
        setThumbsUpColor('#006400');
        saveToLocalStorage('THUMBS_UP');
      }
    }
  };

  const onThumbsDownClick = async () => {
    if (rating() === '') {
      const body = {
        chatflowid: props.chatflowid,
        chatId: props.chatId,
        messageId: props.message?.messageId as string,
        rating: 'THUMBS_DOWN' as FeedbackRatingType,
        content: '',
      };
      const result = await sendFeedbackQuery({
        chatflowid: props.chatflowid,
        apiHost: props.apiHost,
        body,
        onRequest: props.onRequest,
      });

      if (result.data) {
        const data = result.data as any;
        let id = '';
        if (data && data.id) id = data.id;
        setRating('THUMBS_DOWN');
        setFeedbackId(id);
        setShowFeedbackContentModal(true);
        // update the thumbs down color state
        setThumbsDownColor('#8B0000');
        saveToLocalStorage('THUMBS_DOWN');
      }
    }
  };

  const submitFeedbackContent = async (text: string) => {
    const body = {
      content: text,
    };
    const result = await updateFeedbackQuery({
      id: feedbackId(),
      apiHost: props.apiHost,
      body,
      onRequest: props.onRequest,
    });

    if (result.data) {
      setFeedbackId('');
      setShowFeedbackContentModal(false);
    }
  };

  onMount(() => {
    if (botDetailsEl && props.isLoading) {
      botDetailsEl.open = true;
    }
  });

  createEffect(() => {
    if (botDetailsEl && props.isLoading) {
      botDetailsEl.open = true;
    } else if (botDetailsEl && !props.isLoading) {
      botDetailsEl.open = false;
    }
  });

  const renderArtifacts = (item: Partial<FileUpload>) => {
    // Instead of onMount, we'll use a callback ref to apply styles
    const setArtifactRef = (el: HTMLSpanElement) => {
      if (el) {
        const textColor = props.textColor ?? defaultTextColor;
        // Apply textColor to all elements except code blocks
        el.querySelectorAll('a, h1, h2, h3, h4, h5, h6, strong, em, blockquote, li').forEach((element) => {
          (element as HTMLElement).style.color = textColor;
        });

        // Code blocks (with pre) get white text
        el.querySelectorAll('pre').forEach((element) => {
          (element as HTMLElement).style.color = '#FFFFFF';
          // Also ensure any code elements inside pre have white text
          element.querySelectorAll('code').forEach((codeElement) => {
            (codeElement as HTMLElement).style.color = '#FFFFFF';
          });
        });

        // Inline code (not in pre) gets green text
        el.querySelectorAll('code:not(pre code)').forEach((element) => {
          (element as HTMLElement).style.color = '#4CAF50'; // Green color
        });

        el.querySelectorAll('a').forEach((link) => {
          link.target = '_blank';
        });
      }
    };

    return (
      <>
        <Show when={item.type === 'png' || item.type === 'jpeg'}>
          <div class="flex items-center justify-center p-0 m-0">
            <img
              class="w-full h-full bg-cover"
              src={(() => {
                const isFileStorage = typeof item.data === 'string' && item.data.startsWith('FILE-STORAGE::');
                return isFileStorage
                  ? `${props.apiHost}/api/v1/get-upload-file?chatflowId=${props.chatflowid}&chatId=${props.chatId}&fileName=${(
                      item.data as string
                    ).replace('FILE-STORAGE::', '')}`
                  : (item.data as string);
              })()}
            />
          </div>
        </Show>
        <Show when={item.type === 'html'}>
          <div class="mt-2">
            <div innerHTML={item.data as string} />
          </div>
        </Show>
        <Show when={item.type !== 'png' && item.type !== 'jpeg' && item.type !== 'html'}>
          <span
            ref={setArtifactRef}
            innerHTML={Marked.parse(item.data as string)}
            class="prose"
            style={{
              'background-color': props.backgroundColor ?? defaultBackgroundColor,
              color: props.textColor ?? defaultTextColor,
              'border-radius': '6px',
              'font-size': props.fontSize ? `${props.fontSize}px` : `${defaultFontSize}px`,
            }}
          />
        </Show>
      </>
    );
  };

  const formatDateTime = (dateTimeString: string | undefined, showDate: boolean | undefined, showTime: boolean | undefined) => {
    if (!dateTimeString) return '';

    try {
      const date = new Date(dateTimeString);

      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid ISO date string:', dateTimeString);
        return '';
      }

      let formatted = '';

      if (showDate) {
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        const [{ value: month }, , { value: day }, , { value: year }] = dateFormatter.formatToParts(date);
        formatted = `${month.charAt(0).toUpperCase() + month.slice(1)} ${day}, ${year}`;
      }

      if (showTime) {
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        const timeString = timeFormatter.format(date).toLowerCase();
        formatted = formatted ? `${formatted}, ${timeString}` : timeString;
      }

      return formatted;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const isHTMLContent = () => {
    const messageContent = props.message.message || '';
    return props.renderHTML && isFullHTMLDocument(messageContent);
  };

  return (
    <div>
      <div class="flex flex-row justify-start mb-2 items-start host-container" style={{ 'margin-right': isHTMLContent() ? '10px' : '50px' }}>
        <Show when={props.showAvatar}>
          <Avatar initialAvatarSrc={props.avatarSrc} />
        </Show>
        <div class="flex flex-col justify-start" style={{ width: isHTMLContent() ? '100%' : 'auto' }}>
          {props.showAgentMessages &&
            props.message.agentFlowExecutedData &&
            Array.isArray(props.message.agentFlowExecutedData) &&
            props.message.agentFlowExecutedData.length > 0 && (
              <div>
                <WorkflowTreeView workflowData={props.message.agentFlowExecutedData} indentationLevel={24} />
              </div>
            )}
          {props.showAgentMessages && props.message.agentReasoning && (
            <details ref={botDetailsEl} class="mb-2 px-4 py-2 ml-2 chatbot-host-bubble rounded-[6px]">
              <summary class="cursor-pointer">
                <span class="italic">Agent Messages</span>
              </summary>
              <br />
              <For each={props.message.agentReasoning}>
                {(agent) => {
                  const agentMessages = agent.messages ?? [];
                  let msgContent = agent.instructions || (agentMessages.length > 1 ? agentMessages.join('\\n') : agentMessages[0]);
                  if (agentMessages.length === 0 && !agent.instructions) msgContent = `<p>Finished</p>`;
                  return (
                    <AgentReasoningBubble
                      agentName={agent.agentName ?? ''}
                      agentMessage={msgContent}
                      agentArtifacts={agent.artifacts}
                      backgroundColor={props.backgroundColor}
                      textColor={props.textColor}
                      fontSize={props.fontSize}
                      apiHost={props.apiHost}
                      chatflowid={props.chatflowid}
                      chatId={props.chatId}
                      renderHTML={props.renderHTML}
                    />
                  );
                }}
              </For>
            </details>
          )}
          {props.message.artifacts && props.message.artifacts.length > 0 && (
            <div class="flex flex-row items-start flex-wrap w-full gap-2">
              <For each={props.message.artifacts}>
                {(item) => {
                  return item !== null ? <>{renderArtifacts(item)}</> : null;
                }}
              </For>
            </div>
          )}
          {props.message.message && (
            <span
              ref={setBotMessageRef}
              class={isHTMLContent() ? 'px-0 py-0 ml-0 chatbot-host-bubble' : 'px-4 py-2 ml-2 max-w-full chatbot-host-bubble prose'}
              data-testid="host-bubble"
              style={{
                'background-color': isHTMLContent() ? 'transparent' : props.backgroundColor ?? defaultBackgroundColor,
                color: props.textColor ?? defaultTextColor,
                'border-radius': isHTMLContent() ? '0' : '6px',
                'font-size': props.fontSize ? `${props.fontSize}px` : `${defaultFontSize}px`,
                width: isHTMLContent() ? '100%' : 'auto',
                'max-width': isHTMLContent() ? 'none' : 'full',
              }}
            />
          )}
          {props.message.action && (
            <div class="px-4 py-2 flex flex-row justify-start space-x-2">
              <For each={props.message.action.elements || []}>
                {(action) => {
                  return (
                    <>
                      {(action.type === 'approve-button' && action.label === 'Yes') || action.type === 'agentflowv2-approve-button' ? (
                        <button
                          type="button"
                          class="px-4 py-2 font-medium text-green-600 border border-green-600 rounded-full hover:bg-green-600 hover:text-white transition-colors duration-300 flex items-center space-x-2"
                          onClick={() => props.handleActionClick(action, props.message.action)}
                        >
                          <TickIcon />
                          &nbsp;
                          {action.label}
                        </button>
                      ) : (action.type === 'reject-button' && action.label === 'No') || action.type === 'agentflowv2-reject-button' ? (
                        <button
                          type="button"
                          class="px-4 py-2 font-medium text-red-600 border border-red-600 rounded-full hover:bg-red-600 hover:text-white transition-colors duration-300 flex items-center space-x-2"
                          onClick={() => props.handleActionClick(action, props.message.action)}
                        >
                          <XIcon isCurrentColor={true} />
                          &nbsp;
                          {action.label}
                        </button>
                      ) : (
                        <button type="button">{action.label}</button>
                      )}
                    </>
                  );
                }}
              </For>
            </div>
          )}
        </div>
      </div>
      <div>
        {props.message.sourceDocuments && props.message.sourceDocuments.length && (
          <>
            <Show when={props.sourceDocsTitle}>
              <span class="px-2 py-[10px] font-semibold">{props.sourceDocsTitle}</span>
            </Show>
            <div style={{ display: 'flex', 'flex-direction': 'row', width: '100%', 'flex-wrap': 'wrap' }}>
              <For each={[...removeDuplicateURL(props.message)]}>
                {(src) => {
                  const URL = isValidURL(src.metadata.source);
                  return (
                    <SourceBubble
                      pageContent={URL ? URL.pathname : src.pageContent}
                      metadata={src.metadata}
                      onSourceClick={() => {
                        if (URL) {
                          window.open(src.metadata.source, '_blank');
                        } else {
                          props.handleSourceDocumentsClick(src);
                        }
                      }}
                    />
                  );
                }}
              </For>
            </div>
          </>
        )}
      </div>
      <div>
        <div class={`flex items-center px-2 pb-2 ${props.showAvatar ? 'ml-10' : ''}`}>
          <Show when={props.isTTSEnabled && (props.message.id || props.message.messageId)}>
            <TTSButton
              feedbackColor={props.feedbackColor}
              isLoading={(() => {
                const messageId = props.message.id || props.message.messageId;
                return !!(messageId && props.isTTSLoading?.[messageId]);
              })()}
              isPlaying={(() => {
                const messageId = props.message.id || props.message.messageId;
                return !!(messageId && props.isTTSPlaying?.[messageId]);
              })()}
              onClick={() => {
                const messageId = props.message.id || props.message.messageId;
                if (!messageId) return; // Don't allow TTS for messages without valid IDs

                const messageText = props.message.message || '';
                if (props.isTTSLoading?.[messageId]) {
                  return; // Prevent multiple clicks while loading
                }
                if (props.isTTSPlaying?.[messageId]) {
                  props.handleTTSStop?.(messageId);
                } else {
                  props.handleTTSClick?.(messageId, messageText);
                }
              }}
            />
          </Show>
          {props.chatFeedbackStatus && props.message.messageId && (
            <>
              <CopyToClipboardButton feedbackColor={props.feedbackColor} onClick={() => copyMessageToClipboard()} />
              <Show when={copiedMessage()}>
                <div class="copied-message" style={{ color: props.feedbackColor ?? defaultFeedbackColor }}>
                  Copied!
                </div>
              </Show>
              {rating() === '' || rating() === 'THUMBS_UP' ? (
                <ThumbsUpButton feedbackColor={thumbsUpColor()} isDisabled={rating() === 'THUMBS_UP'} rating={rating()} onClick={onThumbsUpClick} />
              ) : null}
              {rating() === '' || rating() === 'THUMBS_DOWN' ? (
                <ThumbsDownButton
                  feedbackColor={thumbsDownColor()}
                  isDisabled={rating() === 'THUMBS_DOWN'}
                  rating={rating()}
                  onClick={onThumbsDownClick}
                />
              ) : null}
              <Show when={props.message.dateTime}>
                <div class="text-sm text-gray-500 ml-2">
                  {formatDateTime(props.message.dateTime, props?.dateTimeToggle?.date, props?.dateTimeToggle?.time)}
                </div>
              </Show>
            </>
          )}
        </div>
        <Show when={showFeedbackContentDialog()}>
          <FeedbackContentDialog
            isOpen={showFeedbackContentDialog()}
            onClose={() => setShowFeedbackContentModal(false)}
            onSubmit={submitFeedbackContent}
            backgroundColor={props.backgroundColor}
            textColor={props.textColor}
          />
        </Show>
      </div>
    </div>
  );
};
