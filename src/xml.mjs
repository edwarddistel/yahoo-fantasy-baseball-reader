import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { YahooApiError } from './errors.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  // Yahoo sometimes emits a single <player>, <stat> or <matchup> as an object.
  // Consumers normalize the specific collections they need with toArray().
});

export function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseYahooXml(xml, resource = '<unknown>') {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new YahooApiError(`Empty XML response for ${resource}.`, { resource });
  }
  if (XMLValidator.validate(xml) !== true) {
    throw new YahooApiError(`Malformed XML response for ${resource}.`, { resource });
  }
  let result;
  try { result = parser.parse(xml); } catch {
    throw new YahooApiError(`Could not parse Yahoo XML for ${resource}.`, { resource });
  }
  if (result?.error || result?.fantasy_content?.error) {
    throw new YahooApiError(`Yahoo returned an API error for ${resource}.`, { resource });
  }
  return result;
}
