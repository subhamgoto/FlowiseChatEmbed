import { For, onMount } from 'solid-js';
import { Marked } from '@ts-stack/markdown';
import { FileUpload } from '../Bot';
import { cloneDeep } from 'lodash';

type Props = {
  apiHost?: string;
  chatflowid: string;
  chatId: string;
  agentName: string;
  agentMessage: string;
  agentArtifacts?: FileUpload[];
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  renderHTML?: boolean;
};

const defaultBackgroundColor = '#f7f8ff';
const defaultTextColor = '#303235';
const defaultFontSize = 16;

export const AgentReasoningBubble = (props: Props) => {
  let botMessageEl: HTMLDivElement | undefined;
  Marked.setOptions({ isNoP: true, sanitize: props.renderHTML !== undefined ? !props.renderHTML : true });

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

  onMount(() => {
    if (botMessageEl) {
      const messageContent = props.agentMessage;

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
        botMessageEl.innerHTML = '';
        botMessageEl.appendChild(iframe);

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

            // Insert CSS at the END of head tag so it overrides all other styles
            let modifiedContent = messageContent;
            if (messageContent.includes('</head>')) {
              modifiedContent = messageContent.replace('</head>', cssOverride + '</head>');
            } else if (messageContent.includes('</style>')) {
              // If no head but has style, insert after the last style
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
          botMessageEl.innerHTML = `**✅ ${props.agentName}** <br/><br/>${bodyContent}`;

          // Apply consistent text styling
          botMessageEl.querySelectorAll('a').forEach((link) => {
            link.target = '_blank';
          });
        } catch (e) {
          console.warn('Failed to parse HTML, falling back to markdown:', e);
          botMessageEl.innerHTML = Marked.parse(`**✅ ${props.agentName}** \n\n${messageContent}`);
        }
      } else if (props.renderHTML && isFullHTMLDocument(messageContent) && !isCompleteHTMLDocument(messageContent)) {
        // Incomplete HTML during streaming - extract and show text, hide raw tags
        const extractedText = extractTextFromIncompleteHTML(messageContent);
        botMessageEl.innerHTML = `**✅ ${props.agentName}** <br/><br/>${extractedText}`;
      } else {
        // Regular markdown content processing
        botMessageEl.innerHTML = Marked.parse(`**✅ ${props.agentName}** \n\n${messageContent}`);
        botMessageEl.querySelectorAll('a').forEach((link) => {
          link.target = '_blank';
        });
      }
    }
  });

  const agentReasoningArtifacts = (artifacts: FileUpload[]) => {
    const newArtifacts = cloneDeep(artifacts);
    for (let i = 0; i < newArtifacts.length; i++) {
      const artifact = newArtifacts[i];
      if (artifact && (artifact.type === 'png' || artifact.type === 'jpeg')) {
        const data = artifact.data as string;
        newArtifacts[i].data = `${props.apiHost}/api/v1/get-upload-file?chatflowId=${props.chatflowid}&chatId=${props.chatId}&fileName=${data.replace(
          'FILE-STORAGE::',
          '',
        )}`;
      }
    }
    return newArtifacts;
  };

  const renderArtifacts = (item: Partial<FileUpload>) => {
    if (item.type === 'png' || item.type === 'jpeg') {
      const src = item.data as string;
      return (
        <div class="flex items-center justify-center max-w-[128px] mr-[10px] p-0 m-0">
          <img class="w-full h-full bg-cover" src={src} />
        </div>
      );
    } else if (item.type === 'html') {
      const src = item.data as string;
      return (
        <div class="mt-2">
          <div innerHTML={src} />
        </div>
      );
    } else {
      const src = item.data as string;
      return (
        <span
          innerHTML={Marked.parse(src)}
          class="prose"
          style={{
            'background-color': props.backgroundColor ?? defaultBackgroundColor,
            color: props.textColor ?? defaultTextColor,
            'border-radius': '6px',
            'font-size': props.fontSize ? `${props.fontSize}px` : `${defaultFontSize}px`,
          }}
        />
      );
    }
  };

  return (
    <div class="mb-6">
      {props.agentArtifacts && (
        <div class="flex flex-row items-start flex-wrap w-full gap-2">
          <For each={agentReasoningArtifacts(props.agentArtifacts)}>
            {(item) => {
              return item !== null ? <>{renderArtifacts(item)}</> : null;
            }}
          </For>
        </div>
      )}
      {props.agentMessage && (
        <span
          ref={botMessageEl}
          class="prose"
          style={{
            'background-color': props.backgroundColor ?? defaultBackgroundColor,
            color: props.textColor ?? defaultTextColor,
            'font-size': props.fontSize ? `${props.fontSize}px` : `${defaultFontSize}px`,
          }}
        />
      )}
    </div>
  );
};
